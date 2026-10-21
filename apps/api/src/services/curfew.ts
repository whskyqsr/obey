import { and, desc, eq, gt, gte, inArray, isNotNull, lt } from "drizzle-orm";
import type { CurfewClash, CurfewNight, CurfewRequest, CurfewSettings } from "@obey/contracts";
import { addDays, dueInstant, localDate, type Weekday } from "@obey/recurrence";
import type { Tx } from "../db/index.js";
import { calendarEvents, curfewRequests, memberships, occurrences, places, relationships, taskSeries, users } from "../db/schema.js";
import { HttpError } from "../errors.js";
import { curfewEnd } from "./location.js";
import { type Occurrence, type Series, materializeSeries } from "./scheduling.js";

/** Today shows the strip from this long before curfew, and the sub's phone starts watching Home then. */
export const CURFEW_LEAD_MINUTES = 60;
/** The "head home" push goes this long before curfew when they aren't home yet. */
export const CURFEW_NUDGE_MINUTES = 30;
/** A broken night stays on Today this long for the Dominant to excuse or accept. */
const BROKEN_SHOWS_HOURS = 36;
const MAX_NIGHT_HOURS = 16;
const CLASH_DAYS = 7;

const SUN_THU: Weekday[] = ["SU", "MO", "TU", "WE", "TH"];
const FRI_SAT: Weekday[] = ["FR", "SA"];
const ALL: Weekday[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const NEXT: Record<Weekday, Weekday> = { MO: "TU", TU: "WE", WE: "TH", TH: "FR", FR: "SA", SA: "SU", SU: "MO" };

/** A time before noon is just after midnight, so it falls on the day after the night it belongs to. */
const afterMidnight = (time: string) => time < "12:00";

/** The hidden series a curfew is kept as: one for every night, or one for Sun–Thu nights and one for Fri–Sat. */
function nightSets(c: CurfewSettings): { title: string; time: string; days: Weekday[] }[] {
  const sets = c.weekendTime
    ? [
        { title: "Weeknight curfew", time: c.time, days: SUN_THU },
        { title: "Weekend curfew", time: c.weekendTime, days: FRI_SAT },
      ]
    : [{ title: "Curfew", time: c.time, days: ALL }];
  return sets.map((s) => ({ ...s, days: afterMidnight(s.time) ? s.days.map((d) => NEXT[d]) : s.days }));
}

/** Every night must end, and not so long after curfew that it swallows the next day. */
export function checkCurfew(c: CurfewSettings) {
  for (const time of [c.time, c.weekendTime].filter((t): t is string => !!t)) {
    const due = dueInstant("2026-01-05", time, "UTC");
    const hours = (curfewEnd(due, c.until, "UTC").getTime() - due.getTime()) / 3_600_000;
    if (hours > MAX_NIGHT_HOURS) throw new HttpError(400, "curfew can't run more than 16 hours; check the stay-in time");
  }
}

/** Only what changes the nights themselves means starting the series over; points and consequences change in place. */
const sameNights = (a: CurfewSettings, b: CurfewSettings) =>
  a.assigneeId === b.assigneeId && a.placeId === b.placeId && a.time === b.time && a.weekendTime === b.weekendTime && a.until === b.until && a.timezone === b.timezone;

/**
 * Saves a curfew and keeps its hidden series in step. Changing the nights retires the old series (nights still to come
 * are cancelled; one already under way runs its course) and starts new ones from the first night more than an hour off.
 */
export async function saveCurfew(db: Tx, relationshipId: string, c: CurfewSettings, actorId: string, now: Date, materializeDays: number) {
  const [rel] = await db.select().from(relationships).where(eq(relationships.id, relationshipId));
  const old = rel!.curfew;
  const current = await db
    .select()
    .from(taskSeries)
    .where(and(eq(taskSeries.relationshipId, relationshipId), eq(taskSeries.active, true), isNotNull(taskSeries.curfewUntil)));
  const rest = { points: c.points, missPenalty: c.missPenalty, consequenceId: c.consequenceId, updatedAt: now };
  if (c.enabled && old?.enabled && sameNights(old, c) && current.length) {
    await db
      .update(taskSeries)
      .set(rest)
      .where(
        inArray(
          taskSeries.id,
          current.map((s) => s.id),
        ),
      );
  } else {
    if (current.length) {
      await db
        .update(taskSeries)
        .set({ active: false, updatedAt: now })
        .where(
          inArray(
            taskSeries.id,
            current.map((s) => s.id),
          ),
        );
      await db
        .update(occurrences)
        .set({ status: "cancelled" })
        .where(
          and(
            inArray(
              occurrences.seriesId,
              current.map((s) => s.id),
            ),
            eq(occurrences.status, "pending"),
            gt(occurrences.dueAt, now),
          ),
        );
    }
    if (c.enabled) {
      for (const set of nightSets(c)) {
        const today = localDate(now, c.timezone);
        const soon = dueInstant(today, set.time, c.timezone).getTime() <= now.getTime() + CURFEW_LEAD_MINUTES * 60_000;
        const [s] = await db
          .insert(taskSeries)
          .values({
            relationshipId,
            assigneeId: c.assigneeId,
            title: set.title,
            schedule: { start: soon ? addDays(today, 1) : today, rule: { freq: "weekly", byWeekday: set.days } },
            dueTime: set.time,
            timezone: c.timezone,
            windowMinutes: CURFEW_LEAD_MINUTES,
            placeId: c.placeId,
            curfewUntil: c.until,
            createdBy: actorId,
            ...rest,
          })
          .returning();
        await materializeSeries(db, s!, addDays(localDate(now, c.timezone), materializeDays), now);
      }
    }
  }
  await db.update(relationships).set({ curfew: c }).where(eq(relationships.id, relationshipId));
}

/** Whether the sub says "I'm home" themselves: their phone can't watch location, or they've paused it. */
export async function canTapHome(db: Tx, relationshipId: string, userId: string, now: Date) {
  const [u] = await db.select({ status: users.locationStatus }).from(users).where(eq(users.id, userId));
  const [m] = await db
    .select({ from: memberships.locationPausedAt, until: memberships.locationPausedUntil })
    .from(memberships)
    .where(and(eq(memberships.relationshipId, relationshipId), eq(memberships.userId, userId)));
  const paused = !!m?.from && m.from <= now && (m.until === null || m.until >= now);
  return u?.status !== "ready" || paused;
}

const nightDto = (occ: Occurrence, series: Series, canTap: boolean): CurfewNight => ({
  occurrenceId: occ.id,
  assigneeId: series.assigneeId,
  placeId: series.placeId!,
  dueAt: occ.dueAt.toISOString(),
  endsAt: curfewEnd(occ.dueAt, series.curfewUntil!, series.timezone).toISOString(),
  status: occ.status,
  arrivedAt: occ.arrivedAt?.toISOString() ?? null,
  leftAt: occ.leftAt?.toISOString() ?? null,
  missConfirmed: occ.missConfirmedAt !== null,
  canTap,
});

/** Curfew nights of this dynamic, newest first, due between the two instants. */
async function nightsBetween(db: Tx, relationshipId: string, from: Date, to: Date) {
  return db
    .select({ occ: occurrences, series: taskSeries })
    .from(occurrences)
    .innerJoin(taskSeries, eq(occurrences.seriesId, taskSeries.id))
    .where(and(eq(taskSeries.relationshipId, relationshipId), isNotNull(taskSeries.curfewUntil), gte(occurrences.dueAt, from), lt(occurrences.dueAt, to)))
    .orderBy(desc(occurrences.dueAt));
}

/** The night Today shows: one about to start or under way, else a broken one nobody has settled yet. */
export async function curfewNightNow(db: Tx, relationshipId: string, now: Date): Promise<CurfewNight | null> {
  const rows = await nightsBetween(db, relationshipId, new Date(now.getTime() - BROKEN_SHOWS_HOURS * 3_600_000), new Date(now.getTime() + CURFEW_LEAD_MINUTES * 60_000));
  const live = rows.find(({ occ, series }) => (occ.status === "pending" || occ.status === "completed") && curfewEnd(occ.dueAt, series.curfewUntil!, series.timezone) > now);
  const broken = rows.find(({ occ }) => occ.status === "missed" && !occ.missConfirmedAt);
  const pick = live ?? broken;
  if (!pick) return null;
  return nightDto(pick.occ, pick.series, await canTapHome(db, relationshipId, pick.series.assigneeId, now));
}

/** Plans in the coming week that overlap a curfew night still to come and involve the sub, unless left as they are. */
export async function curfewClashes(db: Tx, relationshipId: string, now: Date): Promise<CurfewClash[]> {
  const nights = (await nightsBetween(db, relationshipId, now, new Date(now.getTime() + CLASH_DAYS * 86_400_000))).filter(({ occ }) => occ.status === "pending").reverse();
  if (!nights.length) return [];
  const last = nights[nights.length - 1]!;
  const events = await db
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.relationshipId, relationshipId),
        eq(calendarEvents.allDay, false),
        lt(calendarEvents.startsAt, curfewEnd(last.occ.dueAt, last.series.curfewUntil!, last.series.timezone)),
        gt(calendarEvents.endsAt, nights[0]!.occ.dueAt),
      ),
    );
  // A night someone has asked more time for is sorted out by that request instead.
  const asked = new Set((await pendingRequests(db, relationshipId, now)).map(({ r }) => r.occurrenceId));
  const clashes: CurfewClash[] = [];
  for (const { occ, series } of nights) {
    if (asked.has(occ.id)) continue;
    const ends = curfewEnd(occ.dueAt, series.curfewUntil!, series.timezone);
    const e = events.find((e) => (e.withPartner || e.authorId === series.assigneeId) && e.startsAt < ends && e.endsAt > occ.dueAt && !e.dismissedIds.includes(occ.id));
    if (e)
      clashes.push({
        occurrenceId: occ.id,
        dueAt: occ.dueAt.toISOString(),
        endsAt: ends.toISOString(),
        eventId: e.id,
        eventTitle: e.title,
        eventStartsAt: e.startsAt.toISOString(),
        eventEndsAt: e.endsAt.toISOString(),
      });
  }
  return clashes;
}

/** Curfew nights coming up within the nudge window whose sub isn't home yet; marks them nudged. */
export async function claimCurfewNudges(db: Tx, now: Date) {
  const soon = new Date(now.getTime() + CURFEW_NUDGE_MINUTES * 60_000);
  const rows = await db
    .select({ occ: occurrences, series: taskSeries })
    .from(occurrences)
    .innerJoin(taskSeries, eq(occurrences.seriesId, taskSeries.id))
    .where(and(isNotNull(taskSeries.curfewUntil), eq(occurrences.status, "pending"), gt(occurrences.dueAt, now), lt(occurrences.dueAt, soon)));
  const out: { occ: Occurrence; series: Series }[] = [];
  for (const { occ, series } of rows) {
    if (occ.reminderSentAt || occ.arrivedAt) continue;
    const [claimed] = await db.update(occurrences).set({ reminderSentAt: now }).where(eq(occurrences.id, occ.id)).returning();
    out.push({ occ: claimed!, series });
  }
  return out;
}

/** "10:00 PM" in the curfew's own zone, for pushes. */
export const clockTime = (at: Date, zone: string) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: zone }).format(at);

/** The Home place must be one of this dynamic's. */
export async function checkHome(db: Tx, relationshipId: string, placeId: string) {
  const [p] = await db
    .select({ id: places.id })
    .from(places)
    .where(and(eq(places.id, placeId), eq(places.relationshipId, relationshipId)));
  if (!p) throw new HttpError(400, "that place isn't in this dynamic");
}

type RequestRow = typeof curfewRequests.$inferSelect;

export const requestDto = (r: RequestRow, eventTitle: string | null = null): CurfewRequest => ({
  id: r.id,
  occurrenceId: r.occurrenceId,
  eventId: r.eventId,
  eventTitle,
  requestedBy: r.requestedBy,
  fromDueAt: r.fromDueAt.toISOString(),
  untilAt: r.untilAt.toISOString(),
  reason: r.reason,
  status: r.status,
});

/** Asks for more time still waiting on a Dominant; one lapses once its night's curfew arrives unanswered. */
export async function pendingRequests(db: Tx, relationshipId: string, now: Date, requestedBy?: string) {
  return db
    .select({ r: curfewRequests, eventTitle: calendarEvents.title })
    .from(curfewRequests)
    .innerJoin(occurrences, eq(curfewRequests.occurrenceId, occurrences.id))
    .leftJoin(calendarEvents, eq(curfewRequests.eventId, calendarEvents.id))
    .where(
      and(
        eq(curfewRequests.relationshipId, relationshipId),
        eq(curfewRequests.status, "pending"),
        eq(occurrences.status, "pending"),
        gt(occurrences.dueAt, now),
        ...(requestedBy ? [eq(curfewRequests.requestedBy, requestedBy)] : []),
      ),
    )
    .orderBy(occurrences.dueAt);
}

/**
 * The person's curfew night a plan from [startsAt, endsAt) runs into, if any. Nights further out than usual are
 * scheduled on the spot, so a plan weeks away can still ask.
 */
export async function nightForPlan(db: Tx, relationshipId: string, userId: string, startsAt: Date, endsAt: Date, now: Date) {
  const series = await db
    .select()
    .from(taskSeries)
    .where(and(eq(taskSeries.relationshipId, relationshipId), eq(taskSeries.assigneeId, userId), eq(taskSeries.active, true), isNotNull(taskSeries.curfewUntil)));
  if (!series.length) return null;
  for (const s of series) await materializeSeries(db, s, addDays(localDate(endsAt, s.timezone), 1), now);
  const rows = await db
    .select({ occ: occurrences, series: taskSeries })
    .from(occurrences)
    .innerJoin(taskSeries, eq(occurrences.seriesId, taskSeries.id))
    .where(
      and(
        inArray(
          taskSeries.id,
          series.map((s) => s.id),
        ),
        eq(occurrences.status, "pending"),
        gt(occurrences.dueAt, now),
        lt(occurrences.dueAt, endsAt),
        gte(occurrences.dueAt, new Date(startsAt.getTime() - MAX_NIGHT_HOURS * 3_600_000)),
      ),
    )
    .orderBy(occurrences.dueAt);
  const hit = rows.find(({ occ, series }) => curfewEnd(occ.dueAt, series.curfewUntil!, series.timezone) > startsAt);
  if (!hit) return null;
  return { occ: hit.occ, series: hit.series, endsAt: curfewEnd(hit.occ.dueAt, hit.series.curfewUntil!, hit.series.timezone) };
}
