import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { localDate, opensOn } from "@obey/recurrence";
import type { Tx } from "../db/index.js";
import { locationEvents, occurrences, places, taskSeries } from "../db/schema.js";
import { HttpError, forbidden } from "../errors.js";
import { OFFLINE_HOURS, type Occurrence, type Series, applyMiss, assertWindowOpen, finalizeCompletion } from "./scheduling.js";

/** Metres between two points, on a sphere (close enough at these distances). */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** A browser fix vaguer than this can't place someone at a 100 m spot. */
export const CHECKIN_MAX_ACCURACY_M = 500;

/** When a report says it happened: now, or earlier if it was queued offline (within a day). */
function reportedAt(at: string | undefined, now: Date): Date {
  if (!at) return now;
  const d = new Date(at);
  if (now.getTime() - d.getTime() > OFFLINE_HOURS * 3_600_000) throw new HttpError(409, "this was reported too long ago to count");
  return d < now ? d : now;
}

/** Done by being there: approval-required tasks go to the Dominant, the rest complete when they got there (or stayed long enough). */
async function finishAt(db: Tx, series: Series, occ: Occurrence, at: Date): Promise<Occurrence> {
  if (series.approvalRequired) {
    const [submitted] = await db.update(occurrences).set({ status: "submitted", completedAt: at }).where(eq(occurrences.id, occ.id)).returning();
    return submitted!;
  }
  return finalizeCompletion(db, series, occ, at, null);
}

/** The assignee got to the task's place: their phone noticed (`enter`) or they checked in from a browser (`checkin`). */
export async function arriveAt(
  db: Tx,
  series: Series,
  occ: Occurrence,
  userId: string,
  report: { kind: "enter" | "checkin"; lat: number; lng: number; accuracyM: number; at?: string },
  now: Date,
): Promise<Occurrence> {
  if (!series.placeId) throw new HttpError(409, "this task isn't tied to a place");
  if (userId !== series.assigneeId) throw forbidden("only the assignee can check in");
  if (occ.status !== "pending") throw new HttpError(409, `occurrence is ${occ.status}`);
  if (occ.arrivedAt) return occ;
  const at = reportedAt(report.at, now);
  const opens = opensOn(series.schedule, occ.originalDate);
  if (opens && localDate(at, series.timezone) < opens) throw new HttpError(409, `this one opens on ${opens}`);
  assertWindowOpen(series, occ, at);
  if (at.getTime() > occ.dueAt.getTime() + series.graceMinutes * 60_000) throw new HttpError(409, "the deadline has passed");
  const [place] = await db.select().from(places).where(eq(places.id, series.placeId));
  if (!place) throw new HttpError(409, "this task's place was deleted");
  if (report.kind === "checkin" && report.accuracyM > CHECKIN_MAX_ACCURACY_M) throw new HttpError(422, "your location isn't precise enough; try from your phone");
  // A fix is a circle, not a point: count it when that circle reaches the place's.
  const slack = Math.min(report.accuracyM, report.kind === "checkin" ? 100 : 250);
  if (distanceM(report, place) > place.radiusM + slack) throw new HttpError(422, `you're not at ${place.name} yet`);
  await db.insert(locationEvents).values({ occurrenceId: occ.id, userId, kind: report.kind, lat: report.lat, lng: report.lng, accuracyM: report.accuracyM, at });
  const [arrived] = await db.update(occurrences).set({ arrivedAt: at }).where(eq(occurrences.id, occ.id)).returning();
  if (!series.stayMinutes) return finishAt(db, series, arrived!, at);
  const stayedUntil = new Date(at.getTime() + series.stayMinutes * 60_000);
  return stayedUntil <= now ? finishAt(db, series, arrived!, stayedUntil) : arrived!;
}

/**
 * The assignee's phone noticed them leaving the place. Before the stay is up that's a miss ("left early");
 * otherwise, and when they hadn't arrived, it changes nothing. Returns the occurrence and any consequence it handed out.
 */
export async function leaveFrom(db: Tx, series: Series, occ: Occurrence, userId: string, report: { at?: string }, now: Date) {
  if (!series.placeId) throw new HttpError(409, "this task isn't tied to a place");
  if (userId !== series.assigneeId) throw forbidden("only the assignee can report this");
  const at = reportedAt(report.at, now);
  await db.insert(locationEvents).values({ occurrenceId: occ.id, userId, kind: "exit", at });
  if (occ.status !== "pending" || !occ.arrivedAt || occ.leftAt || !series.stayMinutes || at < occ.arrivedAt) return { occ, consequence: null, leftEarly: false };
  const stayedUntil = new Date(occ.arrivedAt.getTime() + series.stayMinutes * 60_000);
  if (at >= stayedUntil) return { occ: await finishAt(db, series, occ, stayedUntil), consequence: null, leftEarly: false };
  const [missed] = await db
    .update(occurrences)
    .set({ status: "missed", leftAt: at, missConfirmedAt: null })
    .where(and(eq(occurrences.id, occ.id), eq(occurrences.status, "pending")))
    .returning();
  if (!missed) return { occ, consequence: null, leftEarly: false };
  return { occ: missed, consequence: await applyMiss(db, series, missed, now), leftEarly: true };
}

/** Completes location tasks whose assignee has stayed as long as asked. Run by the worker before misses are marked. */
export async function finishStays(db: Tx, now: Date) {
  const due = await db
    .select({ occ: occurrences, series: taskSeries })
    .from(occurrences)
    .innerJoin(taskSeries, eq(occurrences.seriesId, taskSeries.id))
    .where(
      and(
        eq(occurrences.status, "pending"),
        isNotNull(occurrences.arrivedAt),
        isNull(occurrences.leftAt),
        isNotNull(taskSeries.placeId),
        isNotNull(taskSeries.stayMinutes),
        sql`${occurrences.arrivedAt} + make_interval(mins => ${taskSeries.stayMinutes}) <= ${now.toISOString()}::timestamptz`,
      ),
    );
  const done: { occ: Occurrence; series: Series }[] = [];
  for (const { occ, series } of due) {
    const stayedUntil = new Date(occ.arrivedAt!.getTime() + series.stayMinutes! * 60_000);
    done.push({ occ: await finishAt(db, series, occ, stayedUntil), series });
  }
  return done;
}
