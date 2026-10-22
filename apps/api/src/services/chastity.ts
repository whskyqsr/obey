import { type ChastityEvent, type ChastityLock, allFeatures } from "@obey/contracts";
import { and, desc, eq, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import type { Tx } from "../db/index.js";
import { chastityEvents, chastityLocks, relationships, safeCalls } from "../db/schema.js";

export type Lock = typeof chastityLocks.$inferSelect;
export type LockEvent = typeof chastityEvents.$inferSelect;

export const OPEN = ["pending", "active", "break"] as const;
/** Running: the clock counts, whether they're locked or out on a break. */
const RUNNING = ["active", "break"] as const;

/** Whether anyone in the dynamic has a Red call open: the wearer may then see the keybox code at once. */
export async function redCallOpen(db: Tx, relationshipId: string) {
  const [call] = await db
    .select({ id: safeCalls.id })
    .from(safeCalls)
    .where(and(eq(safeCalls.relationshipId, relationshipId), eq(safeCalls.level, "red"), isNull(safeCalls.clearedAt)))
    .limit(1);
  return !!call;
}

/** Whether the viewer may see the sealed keybox photo now: the keyholder always; the wearer once released, or on a Red call. */
export const canSeeKeybox = (l: Lock, viewerId: string, red: boolean) => !!l.keybox && (viewerId !== l.wearerId || l.status === "ended" || red);

export function lockDto(l: Lock, viewerId: string, red: boolean): ChastityLock {
  const hidden = l.hideTime && viewerId === l.wearerId && l.status !== "ended";
  return {
    id: l.id,
    relationshipId: l.relationshipId,
    wearerId: l.wearerId,
    keyholderId: l.keyholderId,
    status: l.status,
    keyMode: l.keyMode,
    minutes: hidden ? null : l.minutes,
    hideTime: l.hideTime,
    startedAt: l.startedAt?.toISOString() ?? null,
    endsAt: hidden ? null : (l.endsAt?.toISOString() ?? null),
    timeHidden: hidden && (l.endsAt !== null || l.minutes !== null),
    breakEndsAt: l.breakEndsAt?.toISOString() ?? null,
    hasKeybox: !!l.keybox,
    canSeeKeybox: canSeeKeybox(l, viewerId, red),
    createdAt: l.createdAt.toISOString(),
    endedAt: l.endedAt?.toISOString() ?? null,
    endReason: l.endReason,
  };
}

/** Amounts of time stay out of the log for a wearer who isn't shown the time left. */
export function eventDto(e: LockEvent, lock: Lock, viewerId: string): ChastityEvent {
  const hidden = lock.hideTime && viewerId === lock.wearerId && lock.status !== "ended" && (e.kind === "time" || e.kind === "started");
  return {
    id: e.id,
    lockId: e.lockId,
    kind: e.kind,
    status: e.status,
    minutes: hidden ? null : e.minutes,
    note: e.note,
    byId: e.byId,
    createdAt: e.createdAt.toISOString(),
    decidedAt: e.decidedAt?.toISOString() ?? null,
    taskId: e.taskId,
  };
}

export async function openLock(db: Tx, relationshipId: string, wearerId: string): Promise<Lock | null> {
  const [l] = await db
    .select()
    .from(chastityLocks)
    .where(and(eq(chastityLocks.relationshipId, relationshipId), eq(chastityLocks.wearerId, wearerId), inArray(chastityLocks.status, [...OPEN])))
    .orderBy(desc(chastityLocks.createdAt))
    .limit(1);
  return l ?? null;
}

/**
 * Moves a running lock's end by `minutes` (negative takes time off), never to before now, and logs why. Open-ended
 * locks have no end to move. Returns the logged event, or null when nothing changed (or this cause was already counted).
 */
export async function changeLockTime(
  db: Tx,
  lock: Lock,
  minutes: number,
  why: { note: string | null; byId: string | null; causedByOccurrenceId?: string; ledgerId?: string },
  now: Date,
): Promise<LockEvent | null> {
  if (!lock.endsAt || !RUNNING.includes(lock.status as (typeof RUNNING)[number])) return null;
  const [e] = await db
    .insert(chastityEvents)
    .values({
      lockId: lock.id,
      kind: "time",
      minutes,
      note: why.note,
      byId: why.byId,
      createdAt: now,
      causedByOccurrenceId: why.causedByOccurrenceId ?? null,
      ledgerId: why.ledgerId ?? null,
    })
    .onConflictDoNothing()
    .returning();
  if (!e) return null;
  const endsAt = new Date(Math.max(lock.endsAt.getTime() + minutes * 60_000, now.getTime()));
  await db.update(chastityLocks).set({ endsAt }).where(eq(chastityLocks.id, lock.id));
  return e;
}

async function chastityOn(db: Tx, relationshipId: string) {
  const [rel] = await db.select({ features: relationships.features }).from(relationships).where(eq(relationships.id, relationshipId));
  return !!rel && allFeatures(rel.features).chastity;
}

/** A consequence that adds lock time, for a missed task: it adds to their running lock, if they have one. */
export async function lockTimeForMiss(db: Tx, c: { relationshipId: string; title: string; lockMinutes: number }, assigneeId: string, occurrenceId: string, why: string, now: Date) {
  if (!(await chastityOn(db, c.relationshipId))) return null;
  const lock = await openLock(db, c.relationshipId, assigneeId);
  if (!lock) return null;
  return changeLockTime(db, lock, c.lockMinutes, { note: `${why}: ${c.title}`, byId: null, causedByOccurrenceId: occurrenceId }, now);
}

/** Takes back the time a miss added, when the miss is undone and the lock is still running. */
export async function withdrawLockTime(db: Tx, occurrenceId: string, now: Date) {
  const [e] = await db.delete(chastityEvents).where(eq(chastityEvents.causedByOccurrenceId, occurrenceId)).returning();
  if (!e?.minutes) return;
  const [lock] = await db.select().from(chastityLocks).where(eq(chastityLocks.id, e.lockId));
  if (!lock?.endsAt || !RUNNING.includes(lock.status as (typeof RUNNING)[number])) return;
  const endsAt = new Date(Math.max(lock.endsAt.getTime() - e.minutes * 60_000, now.getTime()));
  await db.update(chastityLocks).set({ endsAt }).where(eq(chastityLocks.id, lock.id));
}

/** A reward that takes time off, once its redemption is marked redeemed. */
export async function lockTimeForReward(db: Tx, r: { relationshipId: string; title: string; lockMinutes: number }, userId: string, ledgerId: string, byId: string, now: Date) {
  if (!(await chastityOn(db, r.relationshipId))) return null;
  const lock = await openLock(db, r.relationshipId, userId);
  if (!lock) return null;
  return changeLockTime(db, lock, -r.lockMinutes, { note: `Redeemed “${r.title}”`, byId, ledgerId }, now);
}

/** Ends a lock. The keybox photo is no longer sealed, so the wearer can open the box. */
export async function endLock(db: Tx, lock: Lock, byId: string | null, reason: "time" | "released", now: Date) {
  const [ended] = await db
    .update(chastityLocks)
    .set({ status: "ended", endedAt: now, endedBy: byId, endReason: reason, breakEndsAt: null })
    .where(and(eq(chastityLocks.id, lock.id), inArray(chastityLocks.status, [...RUNNING])))
    .returning();
  if (!ended) return null;
  await db.insert(chastityEvents).values({ lockId: lock.id, kind: "ended", note: reason === "time" ? "Time's up" : null, byId, createdAt: now });
  return ended;
}

/** Timed locks whose time is up. */
export async function expiredLocks(db: Tx, now: Date) {
  return db
    .select()
    .from(chastityLocks)
    .where(and(inArray(chastityLocks.status, [...RUNNING]), isNotNull(chastityLocks.endsAt), lte(chastityLocks.endsAt, now)));
}

/** Breaks that ran out without a relock; each is marked overdue once, so the keyholder hears about it once. */
export async function overdueBreaks(db: Tx, now: Date) {
  const late = await db
    .select({ lock: chastityLocks, event: chastityEvents })
    .from(chastityLocks)
    .innerJoin(chastityEvents, and(eq(chastityEvents.lockId, chastityLocks.id), eq(chastityEvents.kind, "break"), eq(chastityEvents.status, "approved")))
    .where(and(eq(chastityLocks.status, "break"), lte(chastityLocks.breakEndsAt, now)));
  const out: Lock[] = [];
  for (const { lock, event } of late) {
    const [e] = await db
      .update(chastityEvents)
      .set({ status: "overdue" })
      .where(and(eq(chastityEvents.id, event.id), eq(chastityEvents.status, "approved")))
      .returning();
    if (e) out.push(lock);
  }
  return out;
}
