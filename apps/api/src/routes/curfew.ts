import { and, eq, isNotNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { approveCurfewRequestInput, curfewCheckInput, curfewInput, curfewRequestInput, excuseCurfewInput } from "@obey/contracts";
import { dueInstant } from "@obey/recurrence";
import type { Deps } from "../app.js";
import { curfewRequests, occurrences, relationships, taskSeries } from "../db/schema.js";
import { HttpError, forbidden, notFound } from "../errors.js";
import { occurrenceDto } from "../serialize.js";
import { canManage, managers, membership, requireManager, requireMember } from "../services/access.js";
import { canTapHome, checkCurfew, checkHome, clockTime, curfewClashes, curfewNightNow, nightForPlan, pendingRequests, requestDto, saveCurfew } from "../services/curfew.js";
import { arriveAt, curfewEnd } from "../services/location.js";
import { editOccurrence } from "../services/scheduling.js";
import { loadOccurrence } from "./tasks.js";

/** A later home-by has to be after curfew and before the stay-in time ends. */
function checkUntil(night: { occ: { dueAt: Date }; series: { curfewUntil: string | null; timezone: string } }, until: Date) {
  if (until <= night.occ.dueAt) throw new HttpError(400, "pick a time after curfew");
  if (until >= curfewEnd(night.occ.dueAt, night.series.curfewUntil!, night.series.timezone)) throw new HttpError(400, "that's past the stay-in time");
}

/** "tonight", or "on Friday night" for a night further off. */
function whichNight(dueAt: Date, zone: string, now: Date) {
  const day = (d: Date, back: number) => new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(new Date(d.getTime() - back * 3_600_000));
  // Up to 6 AM still counts as last night.
  return day(dueAt, 12) === day(now, 6) ? "tonight" : `on ${nightOf(dueAt, zone)} night`;
}

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
    const manager = canManage(m.role);
    return {
      settings: rel?.curfew ?? null,
      night: await curfewNightNow(db, req.params.id, now),
      clashes: manager ? await curfewClashes(db, req.params.id, now) : [],
      requests: (await pendingRequests(db, req.params.id, now, manager ? undefined : req.user.id)).map(({ r, eventTitle }) => requestDto(r, eventTitle)),
    };
  });

  // Making a plan: does it run into one of my curfew nights?
  app.post<{ Params: { id: string } }>("/relationships/:id/curfew/check", async (req) => {
    await requireMember(db, req.params.id, req.user.id);
    const body = curfewCheckInput.parse(req.body);
    const hit = await nightForPlan(db, req.params.id, req.user.id, new Date(body.startsAt), new Date(body.endsAt), deps.now());
    return { night: hit && { occurrenceId: hit.occ.id, dueAt: hit.occ.dueAt.toISOString(), endsAt: hit.endsAt.toISOString() } };
  });

  // "More time tonight", or "Ask until 1:00 AM" from a plan: one night's curfew moved later, if a Dominant agrees.
  app.post<{ Params: { id: string } }>("/relationships/:id/curfew/requests", async (req, reply) => {
    await requireMember(db, req.params.id, req.user.id);
    const body = curfewRequestInput.parse(req.body);
    const now = deps.now();
    const night = await loadNight(req.params.id, body.occurrenceId);
    const { occ, series } = night;
    if (series.assigneeId !== req.user.id) throw forbidden("only the person on curfew can ask for more time");
    if (occ.status !== "pending" || occ.dueAt <= now) throw new HttpError(409, "curfew has already started tonight");
    const until = new Date(body.until);
    checkUntil(night, until);
    if ((await pendingRequests(db, req.params.id, now, req.user.id)).some(({ r }) => r.occurrenceId === occ.id)) throw new HttpError(409, "you've already asked about this night");
    const [r] = await db
      .insert(curfewRequests)
      .values({
        relationshipId: req.params.id,
        occurrenceId: occ.id,
        eventId: body.eventId ?? null,
        requestedBy: req.user.id,
        fromDueAt: occ.dueAt,
        untilAt: until,
        reason: body.reason?.trim() || null,
      })
      .returning();
    await notifier.send(await managers(db, req.params.id, req.user.id), {
      title: "Fealty",
      body: `${req.user.displayName} asks to be home by ${clockTime(until, series.timezone)} ${whichNight(occ.dueAt, series.timezone, now)}`,
      data: { type: "curfew", relationshipId: req.params.id },
    });
    return reply.status(201).send(requestDto(r!));
  });

  app.post<{ Params: { id: string } }>("/curfew-requests/:id/approve", async (req) => {
    const { r, night } = await loadRequest(req.params.id, req.user.id);
    const body = approveCurfewRequestInput.parse(req.body ?? {});
    const until = body.until ? new Date(body.until) : r.untilAt;
    checkUntil(night, until);
    const now = deps.now();
    const updated = await db.transaction(async (tx) => {
      // The nudge goes again before the new time, unless they're already home.
      await tx.update(occurrences).set({ dueAt: until, reminderSentAt: null }).where(eq(occurrences.id, night.occ.id));
      const [u] = await tx
        .update(curfewRequests)
        .set({ status: "approved", grantedAt: until, decidedBy: req.user.id, decidedAt: now })
        .where(eq(curfewRequests.id, r.id))
        .returning();
      return u!;
    });
    const tz = night.series.timezone;
    await notifier.send([r.requestedBy], {
      title: "Fealty",
      body: `${req.user.displayName} moved your curfew to ${clockTime(until, tz)} ${whichNight(night.occ.dueAt, tz, now)}`,
      data: { type: "curfew", relationshipId: r.relationshipId },
    });
    return requestDto(updated);
  });

  app.post<{ Params: { id: string } }>("/curfew-requests/:id/decline", async (req) => {
    const { r, night } = await loadRequest(req.params.id, req.user.id);
    const [updated] = await db.update(curfewRequests).set({ status: "declined", decidedBy: req.user.id, decidedAt: deps.now() }).where(eq(curfewRequests.id, r.id)).returning();
    const tz = night.series.timezone;
    await notifier.send([r.requestedBy], {
      title: "Fealty",
      body: `${req.user.displayName} said no: curfew stays at ${clockTime(night.occ.dueAt, tz)} ${whichNight(night.occ.dueAt, tz, deps.now())}`,
      data: { type: "curfew", relationshipId: r.relationshipId },
    });
    return requestDto(updated!);
  });

  async function loadNight(relationshipId: string, occurrenceId: string) {
    const [row] = await db
      .select({ occ: occurrences, series: taskSeries })
      .from(occurrences)
      .innerJoin(taskSeries, eq(occurrences.seriesId, taskSeries.id))
      .where(and(eq(occurrences.id, occurrenceId), eq(taskSeries.relationshipId, relationshipId), isNotNull(taskSeries.curfewUntil)));
    if (!row) throw notFound();
    return row;
  }

  async function loadRequest(id: string, userId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound();
    const [r] = await db.select().from(curfewRequests).where(eq(curfewRequests.id, id));
    if (!r) throw notFound();
    await requireManager(db, r.relationshipId, userId);
    if (r.status !== "pending") throw new HttpError(409, `this was already ${r.status}`);
    const night = await loadNight(r.relationshipId, r.occurrenceId);
    if (night.occ.status !== "pending" || night.occ.dueAt <= deps.now()) throw new HttpError(409, "curfew has already started that night");
    return { r, night };
  }

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
