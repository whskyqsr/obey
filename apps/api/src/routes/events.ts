import { and, eq, gt, gte, inArray, isNotNull, isNull, lt, ne } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { moveLike } from "@obey/recurrence";
import { calendarEventInput, plainDate } from "@obey/contracts";
import type { Deps } from "../app.js";
import type { Tx } from "../db/index.js";
import { calendarEvents, curfewRequests, memberships, occurrences, relationships, taskSeries, users } from "../db/schema.js";
import { HttpError, forbidden, notFound } from "../errors.js";
import { canManage, requireMember } from "../services/access.js";
import { repeatsOf } from "../services/plans.js";
import { nightForPlan } from "../services/curfew.js";
import { sendWithWords } from "../notify.js";

type Event = typeof calendarEvents.$inferSelect;
type Due = { id: string; dueAt: Date; assigneeId: string };

/** All-day tasks are due at the very end of their day (23:59:59.999 local); nothing else lands on .999. */
const allDayDue = (d: Date) => d.getUTCMilliseconds() === 999;

/**
 * Timed tasks still to do that fall due while the event is on, for whoever it involves: the author, and the partner
 * when they're in on it. All-day tasks fit around plans, so they don't clash.
 */
const clashes = (e: Pick<Event, "startsAt" | "endsAt" | "authorId" | "withPartner" | "dismissedIds">, due: Due[]) =>
  due.filter((o) => (e.withPartner || o.assigneeId === e.authorId) && !allDayDue(o.dueAt) && o.dueAt >= e.startsAt && o.dueAt < e.endsAt && !e.dismissedIds.includes(o.id));

async function pendingBetween(db: Tx, relationshipId: string, from: Date, to: Date): Promise<Due[]> {
  return db
    .select({ id: occurrences.id, dueAt: occurrences.dueAt, assigneeId: taskSeries.assigneeId })
    .from(occurrences)
    .innerJoin(taskSeries, eq(occurrences.seriesId, taskSeries.id))
    .where(
      and(
        eq(taskSeries.relationshipId, relationshipId),
        eq(occurrences.status, "pending"),
        gte(occurrences.dueAt, from),
        lt(occurrences.dueAt, to),
        // Curfew nights are sorted out from Today (excuse that night or leave it), not moved like tasks.
        isNull(taskSeries.curfewUntil),
      ),
    );
}

const eventDto = (e: Event, due: Due[]) => ({
  id: e.id,
  relationshipId: e.relationshipId,
  authorId: e.authorId,
  title: e.title,
  startsAt: e.startsAt.toISOString(),
  endsAt: e.endsAt.toISOString(),
  allDay: e.allDay,
  withPartner: e.withPartner,
  noteMd: e.noteMd,
  seriesId: e.seriesId,
  repeat: e.repeat ?? null,
  pauseTasks: e.pauseTasks,
  pauseStatus: e.pauseStatus ?? null,
  // Tasks a plan has paused are excused, so they don't clash with it.
  conflictIds: e.pauseStatus === "approved" ? [] : clashes(e, due).map((o) => o.id),
  changedBy: e.changedBy,
  previousEndsAt: e.previousEndsAt?.toISOString() ?? null,
  changeNote: e.changeNote,
});

/** "12:00 AM" in the person's own zone, as best we know it. */
function clock(at: Date, zone: string | null | undefined) {
  const tz = zone ?? "UTC";
  try {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz }).format(at);
  } catch {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(at);
  }
}

/** Every notification about one plan (or one repeating plan) shares a tag, so the latest replaces the rest. */
const planTag = (e: { id: string; seriesId: string | null }) => `plan:${e.seriesId ?? e.id}`;

export const eventRoutes = (deps: Deps) => async (app: FastifyInstance) => {
  const { db, notifier } = deps;

  async function withConflicts(e: Event) {
    return eventDto(e, await pendingBetween(db, e.relationshipId, e.startsAt, e.endsAt));
  }

  async function loadOwn(eventId: string, userId: string) {
    if (!z.string().uuid().safeParse(eventId).success) throw notFound();
    const [e] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, eventId));
    if (!e) throw notFound();
    await requireMember(db, e.relationshipId, userId);
    if (e.authorId !== userId) throw forbidden("only the person who added an event can change it");
    return e;
  }

  /** Tells the partner, and says when the plan runs into their tasks so they can move them. */
  async function tellPartners(e: Event, authorName: string, verb: "added" | "moved" | "changed", repeating = false) {
    const others = await db
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(and(eq(memberships.relationshipId, e.relationshipId), ne(memberships.userId, e.authorId)));
    const asks = e.pauseStatus === "asked";
    const what = `${repeating ? "a repeating plan" : "a plan"} on the calendar`;
    // One notification per plan: moving it again replaces the last one instead of adding another.
    const push = {
      title: "Fealty",
      body: asks ? `${authorName} ${verb} ${what} and asks to pause tasks during it` : `${authorName} ${verb} ${what}`,
      data: { type: "event_changed", eventId: e.id },
      tag: planTag(e),
    };
    await sendWithWords(
      db,
      notifier,
      others.map((o) => o.userId),
      push,
      asks ? { ...push, body: `${authorName} ${verb} ${what} and asks to pause tasks during ${e.title}` } : null,
    );
  }

  /** Events overlapping the dates (inclusive), padded a day each side like occurrences since dates are local. */
  app.get<{ Params: { id: string }; Querystring: { from?: string; to?: string } }>("/relationships/:id/events", async (req) => {
    await requireMember(db, req.params.id, req.user.id);
    const q = z.object({ from: plainDate, to: plainDate }).parse(req.query);
    const from = new Date(Date.parse(q.from) - 86_400_000);
    const to = new Date(Date.parse(q.to) + 2 * 86_400_000);
    const rows = await db
      .select()
      .from(calendarEvents)
      .where(and(eq(calendarEvents.relationshipId, req.params.id), lt(calendarEvents.startsAt, to), gt(calendarEvents.endsAt, from)))
      .orderBy(calendarEvents.startsAt);
    if (!rows.length) return [];
    const start = rows.reduce((m, e) => (e.startsAt < m ? e.startsAt : m), rows[0]!.startsAt);
    const end = rows.reduce((m, e) => (e.endsAt > m ? e.endsAt : m), rows[0]!.endsAt);
    const due = await pendingBetween(db, req.params.id, start, end);
    return rows.map((e) => eventDto(e, due));
  });

  app.post<{ Params: { id: string } }>("/relationships/:id/events", async (req, reply) => {
    const me = await requireMember(db, req.params.id, req.user.id);
    const body = calendarEventInput.parse(req.body);
    const start = new Date(body.startsAt);
    const end = new Date(body.endsAt);
    const times = body.repeat ? repeatsOf(start, end, body.repeat) : [{ startsAt: start, endsAt: end }];
    const seriesId = body.repeat ? crypto.randomUUID() : null;
    // A Dominant's own pause needs no one's OK; anyone else's waits on a Dominant.
    const pause = body.pauseTasks ? (canManage(me.role) ? { pauseStatus: "approved" as const, pauseDecidedBy: req.user.id } : { pauseStatus: "asked" as const, pauseDecidedBy: null }) : { pauseStatus: null, pauseDecidedBy: null };
    const rows = await db
      .insert(calendarEvents)
      .values(
        times.map((t) => ({
          relationshipId: req.params.id,
          authorId: req.user.id,
          title: body.title,
          startsAt: t.startsAt,
          endsAt: t.endsAt,
          allDay: body.allDay,
          withPartner: body.withPartner,
          noteMd: body.noteMd?.trim() || null,
          seriesId,
          repeat: body.repeat ?? null,
          pauseTasks: body.pauseTasks,
          ...pause,
        })),
      )
      .returning();
    const first = rows.reduce((a, b) => (b.startsAt < a.startsAt ? b : a));
    await tellPartners(first, req.user.displayName, "added", rows.length > 1);
    return reply.status(201).send(await withConflicts(first));
  });

  app.patch<{ Params: { id: string } }>("/events/:id", async (req) => {
    if (!z.string().uuid().safeParse(req.params.id).success) throw notFound();
    const [found] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, req.params.id));
    if (!found) throw notFound();
    const m = await requireMember(db, found.relationshipId, req.user.id);
    if (found.authorId !== req.user.id) {
      // A Dominant may move when someone else's plan ends (say, to curfew); the author is told.
      if (!canManage(m.role)) throw forbidden("only the person who added an event can change it");
      if (Object.keys((req.body as object) ?? {}).some((k) => k !== "endsAt" && k !== "note")) throw forbidden("a Dominant can only change when someone else's plan ends");
      const { endsAt, note } = z.object({ endsAt: z.string().datetime({ offset: true }), note: z.string().trim().max(280).nullable().optional() }).parse(req.body);
      const end = new Date(endsAt);
      if (end <= found.startsAt) throw new HttpError(400, "a plan has to end after it starts");
      if (found.allDay) throw new HttpError(400, "an all-day plan can't be given an end time");
      const now = deps.now();
      // A new end past curfew is the new home-by that night, the same as approving more time: a plan's end includes getting home.
      const night = await nightForPlan(db, found.relationshipId, found.authorId, found.startsAt, found.endsAt, now);
      const movesCurfew = night && end > night.occ.dueAt && end < night.endsAt;
      const e = await db.transaction(async (tx) => {
        const [e] = await tx
          .update(calendarEvents)
          .set({ endsAt: end, changedBy: req.user.id, previousEndsAt: found.endsAt, changeSeenAt: null, changeNote: note || null, updatedAt: now })
          .where(eq(calendarEvents.id, found.id))
          .returning();
        if (movesCurfew) {
          await tx.update(occurrences).set({ dueAt: end, reminderSentAt: null }).where(eq(occurrences.id, night.occ.id));
          await tx
            .update(curfewRequests)
            .set({ status: "approved", grantedAt: end, decidedBy: req.user.id, decidedAt: now })
            .where(and(eq(curfewRequests.occurrenceId, night.occ.id), eq(curfewRequests.status, "pending")));
        }
        return e;
      });
      if (end.getTime() !== found.endsAt.getTime()) {
        const [rel] = await db.select({ curfew: relationships.curfew }).from(relationships).where(eq(relationships.id, found.relationshipId));
        const [author] = await db.select({ timezone: users.timezone }).from(users).where(eq(users.id, found.authorId));
        const at = clock(end, author?.timezone ?? rel?.curfew?.timezone);
        const tail = `: it now ends at ${at}${movesCurfew ? `, and curfew moves to ${at} that night` : ""}`;
        const push = { title: "Fealty", body: `${req.user.displayName} changed your plan${tail}`, data: { type: "event_changed", eventId: found.id }, tag: planTag(found) };
        const words = `${req.user.displayName} changed ${found.title}${tail}${e!.changeNote ? `. “${e!.changeNote}”` : ""}`;
        await sendWithWords(db, notifier, [found.authorId], push, { ...push, body: words });
      }
      return withConflicts(e!);
    }
    const current = found;
    const { applyTo, ...changes } = { applyTo: "one", ...(req.body as object) } as { applyTo?: unknown } & Record<string, unknown>;
    const following = z.enum(["one", "following"]).nullish().parse(applyTo) === "following" && current.seriesId !== null;
    // Validate the merged event, so moving only the start can't put it after the end. A plan's repeat is set when it's made.
    const body = calendarEventInput.parse({
      title: current.title,
      startsAt: current.startsAt.toISOString(),
      endsAt: current.endsAt.toISOString(),
      allDay: current.allDay,
      withPartner: current.withPartner,
      noteMd: current.noteMd,
      pauseTasks: current.pauseTasks,
      ...changes,
      repeat: undefined,
    });
    const start = new Date(body.startsAt);
    const end = new Date(body.endsAt);
    const moved = start.getTime() !== current.startsAt.getTime() || end.getTime() !== current.endsAt.getTime();
    // A paused plan that moves or takes in the partner is asked about again; a Dominant's own is fine as it is.
    const reask = body.pauseTasks && (!current.pauseTasks || current.pauseStatus === "declined" || moved || body.withPartner !== current.withPartner);
    const pause = !body.pauseTasks
      ? { pauseStatus: null, pauseDecidedBy: null }
      : canManage(m.role)
        ? { pauseStatus: "approved" as const, pauseDecidedBy: req.user.id }
        : reask
          ? { pauseStatus: "asked" as const, pauseDecidedBy: null }
          : {};
    const shared = {
      title: body.title,
      allDay: body.allDay,
      withPartner: body.withPartner,
      noteMd: body.noteMd?.trim() || null,
      pauseTasks: body.pauseTasks,
      ...pause,
      // The author's own edit settles any change made for them.
      changedBy: null,
      previousEndsAt: null,
      changeSeenAt: null,
      changeNote: null,
      updatedAt: deps.now(),
    };
    const e = await db.transaction(async (tx) => {
      const [e] = await tx.update(calendarEvents).set({ ...shared, startsAt: start, endsAt: end }).where(eq(calendarEvents.id, current.id)).returning();
      if (following) {
        const later = await tx
          .select()
          .from(calendarEvents)
          .where(and(eq(calendarEvents.seriesId, current.seriesId!), gt(calendarEvents.startsAt, current.startsAt), ne(calendarEvents.id, current.id)));
        const zone = current.repeat?.timezone ?? "UTC";
        for (const r of later) {
          await tx
            .update(calendarEvents)
            .set({ ...shared, startsAt: moveLike(r.startsAt, current.startsAt, start, zone), endsAt: moveLike(r.endsAt, current.endsAt, end, zone) })
            .where(eq(calendarEvents.id, r.id));
        }
      }
      return e!;
    });
    if (moved || (reask && e.pauseStatus === "asked")) await tellPartners(e, req.user.displayName, moved ? "moved" : "changed");
    return withConflicts(e);
  });

  /** "That's fine": either partner keeps a clashing task as it is, and it stops counting as a clash. A "Just me" plan still clashes with tasks the partner may manage. */
  app.post<{ Params: { id: string } }>("/events/:id/dismiss", async (req) => {
    const { occurrenceIds } = z.object({ occurrenceIds: z.array(z.string().uuid()).min(1).max(200) }).parse(req.body);
    if (!z.string().uuid().safeParse(req.params.id).success) throw notFound();
    const [e] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, req.params.id));
    if (!e) throw notFound();
    await requireMember(db, e.relationshipId, req.user.id);
    const [updated] = await db
      .update(calendarEvents)
      .set({ dismissedIds: [...new Set([...e.dismissedIds, ...occurrenceIds])] })
      .where(eq(calendarEvents.id, e.id))
      .returning();
    return withConflicts(updated!);
  });

  /** My plans someone else changed that I haven't seen yet, for Today. */
  app.get<{ Params: { id: string } }>("/relationships/:id/events/changes", async (req) => {
    await requireMember(db, req.params.id, req.user.id);
    const rows = await db
      .select()
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.relationshipId, req.params.id),
          eq(calendarEvents.authorId, req.user.id),
          isNotNull(calendarEvents.changedBy),
          ne(calendarEvents.changedBy, req.user.id),
          isNull(calendarEvents.changeSeenAt),
          gt(calendarEvents.endsAt, deps.now()),
        ),
      )
      .orderBy(calendarEvents.startsAt);
    return rows.map((e) => eventDto(e, []));
  });

  app.post<{ Params: { id: string } }>("/events/:id/seen", async (req, reply) => {
    const e = await loadOwn(req.params.id, req.user.id);
    await db.update(calendarEvents).set({ changeSeenAt: deps.now() }).where(eq(calendarEvents.id, e.id));
    return reply.status(204).send();
  });

  /** ?following=1 also removes the later plans of a repeating plan. */
  app.delete<{ Params: { id: string }; Querystring: { following?: string } }>("/events/:id", async (req, reply) => {
    const e = await loadOwn(req.params.id, req.user.id);
    if (req.query.following === "1" && e.seriesId) {
      await db.delete(calendarEvents).where(and(eq(calendarEvents.seriesId, e.seriesId), gte(calendarEvents.startsAt, e.startsAt)));
    } else {
      await db.delete(calendarEvents).where(eq(calendarEvents.id, e.id));
    }
    return reply.status(204).send();
  });

  /** Plans someone asked to pause their tasks during, for a Dominant to answer; one per repeating plan. */
  app.get<{ Params: { id: string } }>("/relationships/:id/events/pause-asks", async (req) => {
    const m = await requireMember(db, req.params.id, req.user.id);
    if (!canManage(m.role)) return [];
    const rows = await db
      .select()
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.relationshipId, req.params.id),
          eq(calendarEvents.pauseStatus, "asked"),
          ne(calendarEvents.authorId, req.user.id),
          gt(calendarEvents.endsAt, deps.now()),
        ),
      )
      .orderBy(calendarEvents.startsAt);
    const seen = new Set<string>();
    return rows.filter((e) => (e.seriesId ? !seen.has(e.seriesId) && !!seen.add(e.seriesId) : true)).map((e) => eventDto(e, []));
  });

  /** A Dominant answers an ask to pause tasks during a plan; for a repeating plan, every repeat still asking. */
  app.post<{ Params: { id: string } }>("/events/:id/pause", async (req) => {
    const { approve } = z.object({ approve: z.boolean() }).parse(req.body);
    if (!z.string().uuid().safeParse(req.params.id).success) throw notFound();
    const [e] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, req.params.id));
    if (!e) throw notFound();
    const m = await requireMember(db, e.relationshipId, req.user.id);
    if (!canManage(m.role)) throw forbidden("only a Dominant can answer this");
    if (e.authorId === req.user.id) throw forbidden("someone else answers your own ask");
    if (e.pauseStatus !== "asked") throw new HttpError(409, "this has already been answered");
    const ids = e.seriesId
      ? (
          await db
            .select({ id: calendarEvents.id })
            .from(calendarEvents)
            .where(and(eq(calendarEvents.seriesId, e.seriesId), eq(calendarEvents.pauseStatus, "asked")))
        ).map((r) => r.id)
      : [e.id];
    await db
      .update(calendarEvents)
      .set({ pauseStatus: approve ? "approved" : "declined", pauseDecidedBy: req.user.id, updatedAt: deps.now() })
      .where(inArray(calendarEvents.id, ids));
    const said = approve ? "OK'd pausing your tasks during" : "said no to pausing your tasks during";
    const push = { title: "Fealty", body: `${req.user.displayName} ${said} your plan`, data: { type: "event_changed", eventId: e.id }, tag: planTag(e) };
    await sendWithWords(db, notifier, [e.authorId], push, { ...push, body: `${req.user.displayName} ${said} ${e.title}` });
    const [updated] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, e.id));
    return withConflicts(updated!);
  });
};
