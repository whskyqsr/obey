import { and, eq, gt, gte, lt, ne } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { calendarEventInput, plainDate } from "@obey/contracts";
import type { Deps } from "../app.js";
import type { Tx } from "../db/index.js";
import { calendarEvents, memberships, occurrences, taskSeries } from "../db/schema.js";
import { forbidden, notFound } from "../errors.js";
import { requireMember } from "../services/access.js";

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
    .where(and(eq(taskSeries.relationshipId, relationshipId), eq(occurrences.status, "pending"), gte(occurrences.dueAt, from), lt(occurrences.dueAt, to)));
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
  conflictIds: clashes(e, due).map((o) => o.id),
});

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
  async function tellPartners(e: Event, authorName: string, verb: "added" | "moved") {
    const others = await db
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(and(eq(memberships.relationshipId, e.relationshipId), ne(memberships.userId, e.authorId)));
    const due = clashes(e, await pendingBetween(db, e.relationshipId, e.startsAt, e.endsAt));
    for (const { userId } of others) {
      const theirs = due.filter((o) => o.assigneeId === userId).length;
      await notifier.send([userId], {
        title: "Fealty",
        body: `${authorName} ${verb} a plan on the calendar${theirs ? `; it overlaps ${theirs === 1 ? "one of your tasks" : `${theirs} of your tasks`}` : ""}`,
        data: { type: "event_changed", eventId: e.id },
      });
    }
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
    await requireMember(db, req.params.id, req.user.id);
    const body = calendarEventInput.parse(req.body);
    const [e] = await db
      .insert(calendarEvents)
      .values({
        relationshipId: req.params.id,
        authorId: req.user.id,
        title: body.title,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        allDay: body.allDay,
        withPartner: body.withPartner,
        noteMd: body.noteMd?.trim() || null,
      })
      .returning();
    await tellPartners(e!, req.user.displayName, "added");
    return reply.status(201).send(await withConflicts(e!));
  });

  app.patch<{ Params: { id: string } }>("/events/:id", async (req) => {
    const current = await loadOwn(req.params.id, req.user.id);
    // Validate the merged event, so moving only the start can't put it after the end.
    const body = calendarEventInput.parse({
      title: current.title,
      startsAt: current.startsAt.toISOString(),
      endsAt: current.endsAt.toISOString(),
      allDay: current.allDay,
      withPartner: current.withPartner,
      noteMd: current.noteMd,
      ...(req.body as object),
    });
    const [e] = await db
      .update(calendarEvents)
      .set({
        title: body.title,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        allDay: body.allDay,
        withPartner: body.withPartner,
        noteMd: body.noteMd?.trim() || null,
        updatedAt: deps.now(),
      })
      .where(eq(calendarEvents.id, current.id))
      .returning();
    const moved = e!.startsAt.getTime() !== current.startsAt.getTime() || e!.endsAt.getTime() !== current.endsAt.getTime();
    if (moved) await tellPartners(e!, req.user.displayName, "moved");
    return withConflicts(e!);
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

  app.delete<{ Params: { id: string } }>("/events/:id", async (req, reply) => {
    const e = await loadOwn(req.params.id, req.user.id);
    await db.delete(calendarEvents).where(eq(calendarEvents.id, e.id));
    return reply.status(204).send();
  });
};
