import { and, eq, isNotNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { curfewInput, excuseCurfewInput } from "@obey/contracts";
import { dueInstant } from "@obey/recurrence";
import type { Deps } from "../app.js";
import { occurrences, relationships, taskSeries } from "../db/schema.js";
import { HttpError, forbidden, notFound } from "../errors.js";
import { occurrenceDto } from "../serialize.js";
import { canManage, membership, requireManager, requireMember } from "../services/access.js";
import { canTapHome, checkCurfew, checkHome, clockTime, curfewClashes, curfewNightNow, saveCurfew } from "../services/curfew.js";
import { arriveAt } from "../services/location.js";
import { editOccurrence } from "../services/scheduling.js";
import { loadOccurrence } from "./tasks.js";

/** The night a curfew belongs to, by name ("Friday"): the evening before one just after midnight. */
const nightOf = (dueAt: Date, zone: string) => new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: zone }).format(new Date(dueAt.getTime() - 12 * 3_600_000));

/**
 * A sub's curfew: a Dominant sets it in Your dynamic, and each night is kept as a hidden task, so a late or early
 * leaving night is missed with its points and consequence like any task, and can be excused.
 */
export const curfewRoutes = (deps: Deps) => async (app: FastifyInstance) => {
  const { db, notifier } = deps;

  app.get<{ Params: { id: string } }>("/relationships/:id/curfew", async (req) => {
    const m = await requireMember(db, req.params.id, req.user.id);
    const [rel] = await db.select({ curfew: relationships.curfew }).from(relationships).where(eq(relationships.id, req.params.id));
    const now = deps.now();
    return {
      settings: rel?.curfew ?? null,
      night: await curfewNightNow(db, req.params.id, now),
      clashes: canManage(m.role) ? await curfewClashes(db, req.params.id, now) : [],
    };
  });

  app.put<{ Params: { id: string } }>("/relationships/:id/curfew", async (req) => {
    await requireManager(db, req.params.id, req.user.id);
    const body = curfewInput.parse(req.body);
    try {
      dueInstant("2026-01-01", null, body.timezone);
    } catch {
      throw new HttpError(400, `unknown timezone ${body.timezone}`);
    }
    if (!(await membership(db, req.params.id, body.assigneeId))) throw new HttpError(400, "that person isn't in this dynamic");
    await checkHome(db, req.params.id, body.placeId);
    checkCurfew(body);
    const [rel] = await db.select({ curfew: relationships.curfew }).from(relationships).where(eq(relationships.id, req.params.id));
    const was = rel?.curfew;
    await db.transaction((tx) => saveCurfew(tx, req.params.id, body, req.user.id, deps.now(), deps.materializeDays));
    if (body.assigneeId !== req.user.id && (body.enabled || was?.enabled)) {
      const at = clockTime(dueInstant("2026-01-05", body.time, "UTC"), "UTC");
      const what = !body.enabled ? "turned your curfew off" : was?.enabled ? "changed your curfew" : `set a curfew: home by ${at}`;
      await notifier.send([body.assigneeId], { title: "Fealty", body: `${req.user.displayName} ${what}`, data: { type: "curfew", relationshipId: req.params.id } });
    }
    return { settings: body, night: await curfewNightNow(db, req.params.id, deps.now()), clashes: await curfewClashes(db, req.params.id, deps.now()) };
  });

  // "I'm home" from someone whose phone can't check: it counts like their phone noticing them get there.
  app.post<{ Params: { id: string } }>("/occurrences/:id/home", async (req) => {
    const { occ, series } = await loadOccurrence(db, req.params.id, req.user.id);
    if (!series.curfewUntil) throw new HttpError(409, "this isn't a curfew");
    if (req.user.id !== series.assigneeId) throw forbidden("only the person on curfew can say they're home");
    if (!(await canTapHome(db, series.relationshipId, req.user.id, deps.now()))) throw new HttpError(409, "your phone checks this one; it'll notice when you're home");
    const updated = await db.transaction((tx) => arriveAt(tx, series, occ, req.user.id, { kind: "tap" }, deps.now()));
    return occurrenceDto(updated, series);
  });

  // A Dominant lets a night go: a broken one stops costing anything, and one still to come won't be checked.
  app.post<{ Params: { id: string } }>("/relationships/:id/curfew/excuse", async (req) => {
    await requireManager(db, req.params.id, req.user.id);
    const { occurrenceId } = excuseCurfewInput.parse(req.body);
    const [row] = await db
      .select({ occ: occurrences, series: taskSeries })
      .from(occurrences)
      .innerJoin(taskSeries, eq(occurrences.seriesId, taskSeries.id))
      .where(and(eq(occurrences.id, occurrenceId), eq(taskSeries.relationshipId, req.params.id), isNotNull(taskSeries.curfewUntil)));
    if (!row) throw notFound();
    const { occ, series } = row;
    const now = deps.now();
    const updated = await db.transaction(async (tx) => {
      if (occ.status === "pending") {
        const [o] = await tx.update(occurrences).set({ status: "excused", editedBy: req.user.id, editedAt: now }).where(eq(occurrences.id, occ.id)).returning();
        return o!;
      }
      if (occ.status === "missed") return editOccurrence(tx, series, occ, req.user.id, { status: "excused" }, now);
      throw new HttpError(409, `this night is ${occ.status}`);
    });
    if (series.assigneeId !== req.user.id)
      await notifier.send([series.assigneeId], {
        title: "Fealty",
        body: `${req.user.displayName} excused your curfew for ${nightOf(occ.dueAt, series.timezone)} night`,
        data: { type: "curfew", relationshipId: req.params.id },
      });
    return occurrenceDto(updated, series);
  });
};
