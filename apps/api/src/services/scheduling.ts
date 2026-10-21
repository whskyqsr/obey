import { and, count, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  type PlainDate,
  addDays,
  delayDue,
  dueInstant,
  isEndOfLocalDay,
  localDate,
  localTime,
  nextAfterCompletion,
  occurrencesBetween,
  opensOn,
  splitSeries,
} from "@obey/recurrence";
import type { Tx } from "../db/index.js";
import { consequences, notes, occurrences, pointsLedger, relationships, reschedules, taskSeries } from "../db/schema.js";
import { HttpError, forbidden } from "../errors.js";
import { type Role, canManage } from "./access.js";

export type Series = typeof taskSeries.$inferSelect;
export type Occurrence = typeof occurrences.$inferSelect;
export type Relationship = typeof relationships.$inferSelect;
export type Consequence = typeof consequences.$inferSelect;

const maxDate = (a: PlainDate, b: PlainDate) => (a > b ? a : b);

/**
 * Creates the series' occurrences from today (in its zone) through `through`. Idempotent: the
 * (series, original_date) key means re-running never duplicates or resurrects a moved occurrence.
 */
export async function materializeSeries(db: Tx, series: Series, through: PlainDate, now: Date): Promise<void> {
  if (!series.active) return;
  const { schedule } = series;
  let dates: PlainDate[];
  if (!schedule.rule) {
    dates = [schedule.start];
  } else if (schedule.anchor === "completion") {
    // One pending occurrence at a time; the rest come from completions and misses.
    const [{ n }] = (await db.select({ n: count() }).from(occurrences).where(eq(occurrences.seriesId, series.id))) as [{ n: number }];
    dates = n === 0 ? [schedule.start] : [];
  } else {
    const today = localDate(now, series.timezone);
    dates = occurrencesBetween(schedule, maxDate(schedule.start, today), through);
  }
  if (dates.length === 0) return;
  await db
    .insert(occurrences)
    .values(
      dates.map((date) => {
        const due = dueInstant(date, series.dueTime, series.timezone);
        return { seriesId: series.id, originalDate: date, dueAt: due, originalDueAt: due };
      }),
    )
    .onConflictDoNothing();
}

export async function materializeRelationship(db: Tx, relationshipId: string, through: PlainDate, now: Date) {
  const rows = await db
    .select()
    .from(taskSeries)
    .where(and(eq(taskSeries.relationshipId, relationshipId), eq(taskSeries.active, true)));
  for (const s of rows) await materializeSeries(db, s, through, now);
}

export async function materializeAll(db: Tx, days: number, now: Date) {
  const rows = await db.select().from(taskSeries).where(eq(taskSeries.active, true));
  for (const s of rows) await materializeSeries(db, s, addDays(localDate(now, s.timezone), days), now);
}

/** For completion-anchored series: queue the next occurrence counted from `basis`. */
async function advanceCompletionSeries(db: Tx, series: Series, basis: PlainDate) {
  if (series.schedule.anchor !== "completion" || !series.active) return;
  const [{ n }] = (await db.select({ n: count() }).from(occurrences).where(eq(occurrences.seriesId, series.id))) as [{ n: number }];
  const next = nextAfterCompletion(series.schedule, basis, n);
  if (!next) return;
  const due = dueInstant(next, series.dueTime, series.timezone);
  await db.insert(occurrences).values({ seriesId: series.id, originalDate: next, dueAt: due, originalDueAt: due }).onConflictDoNothing();
}

/** Whether the dynamic keeps points. When it doesn't, completions and misses book nothing. */
export async function pointsEnabled(db: Tx, relationshipId: string): Promise<boolean> {
  const [rel] = await db.select({ features: relationships.features }).from(relationships).where(eq(relationships.id, relationshipId));
  return rel?.features.points !== false;
}

async function finalizeCompletion(db: Tx, series: Series, occ: Occurrence, completedAt: Date, reviewerId: string | null) {
  const [updated] = await db
    .update(occurrences)
    .set({ status: "completed", completedAt, reviewedBy: reviewerId, reviewedAt: reviewerId ? new Date() : null })
    .where(eq(occurrences.id, occ.id))
    .returning();
  if (series.points !== 0 && (await pointsEnabled(db, series.relationshipId))) {
    await db
      .insert(pointsLedger)
      .values({
        relationshipId: series.relationshipId,
        userId: series.assigneeId,
        delta: series.points,
        kind: "completion",
        note: series.title,
        occurrenceId: occ.id,
        createdBy: reviewerId,
      })
      .onConflictDoNothing();
  }
  await advanceCompletionSeries(db, series, localDate(completedAt, series.timezone));
  return updated!;
}

/** The assignee (or a Dominant on their behalf) marks an occurrence done. */
export async function completeOccurrence(
  db: Tx,
  series: Series,
  occ: Occurrence,
  actor: { userId: string; role: Role },
  noteMd: string | undefined,
  now: Date,
  mood?: number,
  journal?: { title: string; bodyMd: string },
): Promise<Occurrence> {
  const isAssignee = actor.userId === series.assigneeId;
  if (!isAssignee && !canManage(actor.role)) throw forbidden("only the assignee can complete this");
  if (occ.status !== "pending") throw new HttpError(409, `occurrence is ${occ.status}`);
  // The assignee can't work ahead into the next occurrence's turn (tomorrow's daily check-in today); a Dominant can.
  const opens = opensOn(series.schedule, occ.originalDate);
  if (isAssignee && !canManage(actor.role) && opens && localDate(now, series.timezone) < opens) throw new HttpError(409, `this one opens on ${opens}`);
  if (isAssignee && !canManage(actor.role)) assertWindowOpen(series, occ, now);
  if (isAssignee && !canManage(actor.role) && series.steps.some((s) => !occ.stepsDone.includes(s.id))) throw new HttpError(409, "finish every step first");
  // "Proof required" means a photo or a note; a Dominant marking it done needs neither.
  if (series.proofRequired && isAssignee && !canManage(actor.role) && occ.photoCount === 0 && !(noteMd ?? occ.noteMd ?? "").trim() && !journal)
    throw new HttpError(409, "add a photo or a note as proof");
  // A check-in needs the assignee's mood; only they can give it.
  if (series.askMood && isAssignee && !canManage(actor.role) && mood === undefined) throw new HttpError(409, "pick how you feel");
  // A journal task is done by writing the entry; it goes to the journal, shared, and stays linked here.
  if (series.asksJournal && isAssignee && !canManage(actor.role) && !journal) throw new HttpError(409, "write your journal entry first");
  let journalNoteId: string | undefined;
  if (journal && isAssignee && series.asksJournal) {
    const [entry] = await db
      .insert(notes)
      .values({
        relationshipId: series.relationshipId,
        authorId: actor.userId,
        kind: "journal",
        title: journal.title.trim() || series.title,
        bodyMd: journal.bodyMd,
        visibility: "shared",
        mood: mood ?? null,
      })
      .returning({ id: notes.id });
    journalNoteId = entry!.id;
  }
  if (noteMd !== undefined || (mood !== undefined && isAssignee) || journalNoteId)
    await db
      .update(occurrences)
      .set({ ...(noteMd !== undefined ? { noteMd } : {}), ...(mood !== undefined && isAssignee ? { mood } : {}), ...(journalNoteId ? { journalNoteId } : {}) })
      .where(eq(occurrences.id, occ.id));
  if (series.approvalRequired && isAssignee && !canManage(actor.role)) {
    const [submitted] = await db.update(occurrences).set({ status: "submitted", completedAt: now }).where(eq(occurrences.id, occ.id)).returning();
    return submitted!;
  }
  return finalizeCompletion(db, series, occ, now, isAssignee ? null : actor.userId);
}

/** A task with a window can't be started before the last windowMinutes before it's due. */
export function assertWindowOpen(series: Series, occ: Occurrence, now: Date) {
  if (!series.windowMinutes) return;
  const opensAt = occ.dueAt.getTime() - series.windowMinutes * 60_000;
  if (now.getTime() < opensAt) throw new HttpError(409, `this one opens at ${new Date(opensAt).toISOString()}`);
}

/** Ticks a ritual step on or off. Only the assignee does this, while the occurrence is still to do. */
export async function tickStep(db: Tx, series: Series, occ: Occurrence, actorId: string, stepId: string, done: boolean, now: Date): Promise<Occurrence> {
  if (actorId !== series.assigneeId) throw forbidden("only the assignee can do the steps");
  if (occ.status !== "pending") throw new HttpError(409, `occurrence is ${occ.status}`);
  if (!series.steps.some((s) => s.id === stepId)) throw new HttpError(400, "no such step");
  const opens = opensOn(series.schedule, occ.originalDate);
  if (opens && localDate(now, series.timezone) < opens) throw new HttpError(409, `this one opens on ${opens}`);
  assertWindowOpen(series, occ, now);
  const ids = new Set(occ.stepsDone);
  if (done) ids.add(stepId);
  else ids.delete(stepId);
  const [updated] = await db
    .update(occurrences)
    .set({ stepsDone: [...ids] })
    .where(eq(occurrences.id, occ.id))
    .returning();
  return updated!;
}

/** How long the assignee has to take back a completion (the Undo after a tap or swipe). */
export const UNDO_MINUTES = 10;

/** Takes back a completion made moments ago: the occurrence is pending again and its points and any next occurrence go. */
export async function undoCompletion(db: Tx, series: Series, occ: Occurrence, actor: { userId: string; role: Role }, now: Date): Promise<Occurrence> {
  if (occ.status !== "completed" && occ.status !== "submitted") throw new HttpError(409, `occurrence is ${occ.status}`);
  if (!canManage(actor.role)) {
    if (actor.userId !== series.assigneeId) throw forbidden("only the assignee can undo this");
    const recent = occ.completedAt && now.getTime() - occ.completedAt.getTime() <= UNDO_MINUTES * 60_000;
    if (!recent || occ.reviewedBy) throw new HttpError(409, "too late to undo");
  }
  const [reopened] = await db
    .update(occurrences)
    .set({ status: "pending", completedAt: null, reviewedBy: null, reviewedAt: null, journalNoteId: null })
    .where(eq(occurrences.id, occ.id))
    .returning();
  // The entry written to complete it goes with the undo, so doing it again doesn't leave two.
  if (occ.journalNoteId) await db.delete(notes).where(eq(notes.id, occ.journalNoteId));
  await db.delete(pointsLedger).where(and(eq(pointsLedger.occurrenceId, occ.id), eq(pointsLedger.kind, "completion")));
  // A completion-anchored task made its next occurrence on completion; it goes with the undo.
  if (series.schedule.anchor === "completion")
    await db.delete(occurrences).where(and(eq(occurrences.seriesId, series.id), eq(occurrences.status, "pending"), sql`${occurrences.originalDate} > ${occ.originalDate}`));
  return reopened!;
}

export async function reviewOccurrence(db: Tx, series: Series, occ: Occurrence, reviewerId: string, approve: boolean) {
  if (occ.status !== "submitted") throw new HttpError(409, `occurrence is ${occ.status}`);
  if (approve) return finalizeCompletion(db, series, occ, occ.completedAt ?? new Date(), reviewerId);
  const [reopened] = await db
    .update(occurrences)
    .set({ status: "pending", completedAt: null, reviewedBy: reviewerId, reviewedAt: new Date() })
    .where(eq(occurrences.id, occ.id))
    .returning();
  return reopened!;
}

/**
 * A Dominant's correction from a task's history. Points are rebooked to match the new status:
 * completed earns the task's points, missed costs its penalty, excused is neutral.
 */
export async function editOccurrence(
  db: Tx,
  series: Series,
  occ: Occurrence,
  editorId: string,
  change: { status?: "completed" | "missed" | "excused"; completedAt?: Date; noteMd?: string | null },
  now: Date,
): Promise<Occurrence> {
  if (occ.status === "pending" || occ.status === "cancelled") throw new HttpError(409, `occurrence is ${occ.status}`);
  const status = change.status ?? occ.status;
  const completedAt = status === "completed" ? (change.completedAt ?? occ.completedAt ?? occ.dueAt) : status === "submitted" ? occ.completedAt : null;
  const [updated] = await db
    .update(occurrences)
    .set({
      status,
      completedAt,
      ...(change.noteMd !== undefined ? { noteMd: change.noteMd } : {}),
      // A Dominant setting it to missed has decided it: it stays missed and stops asking for a decision.
      missConfirmedAt: status === "missed" ? (change.status === "missed" ? now : occ.missConfirmedAt) : null,
      editedBy: editorId,
      editedAt: now,
    })
    .where(eq(occurrences.id, occ.id))
    .returning();
  if (status !== occ.status) {
    if (status === "missed") await issueMissConsequence(db, series, updated!, now);
    if (occ.status === "missed") await withdrawMissConsequence(db, occ);
    await db.delete(pointsLedger).where(and(eq(pointsLedger.occurrenceId, occ.id), inArray(pointsLedger.kind, ["completion", "miss"])));
    const earned = status === "completed" ? series.points : status === "missed" ? -series.missPenalty : 0;
    const delta = (await pointsEnabled(db, series.relationshipId)) ? earned : 0;
    if (delta !== 0) {
      await db.insert(pointsLedger).values({
        relationshipId: series.relationshipId,
        userId: series.assigneeId,
        delta,
        kind: status === "completed" ? "completion" : "miss",
        note: series.title,
        occurrenceId: occ.id,
        createdBy: editorId,
      });
    }
  }
  return updated!;
}

/**
 * Hands out a consequence as a one-off task, so it's done, missed and reviewed like any other.
 * With `causedBy` it's the automatic one for that missed occurrence, issued at most once (returns null on a repeat).
 */
export async function issueConsequence(
  db: Tx,
  c: Consequence,
  o: { assigneeId: string; date: PlainDate; dueTime: string | null; timezone: string; reason: string; approvalRequired: boolean; createdBy: string; causedBy?: string },
  now: Date,
): Promise<Series | null> {
  const bodyMd = [o.reason && `**Why:** ${o.reason}`, c.bodyMd].filter(Boolean).join("\n\n");
  const [s] = await db
    .insert(taskSeries)
    .values({
      relationshipId: c.relationshipId,
      assigneeId: o.assigneeId,
      title: c.title,
      bodyMd,
      assignedConsequenceId: c.id,
      causedByOccurrenceId: o.causedBy ?? null,
      approvalRequired: o.approvalRequired,
      schedule: { start: o.date },
      dueTime: o.dueTime,
      timezone: o.timezone,
      createdBy: o.createdBy,
    })
    .onConflictDoNothing()
    .returning();
  if (!s) return null;
  await materializeSeries(db, s, o.date, now);
  return s;
}

/** The consequence a task carries, handed out for one of its misses, due when the task says. Null if none applies. */
async function issueMissConsequence(db: Tx, series: Series, occ: Occurrence, now: Date): Promise<Series | null> {
  if (!series.consequenceId) return null;
  const [rel] = await db.select({ features: relationships.features }).from(relationships).where(eq(relationships.id, series.relationshipId));
  if (rel?.features.consequences === false) return null;
  const [c] = await db.select().from(consequences).where(eq(consequences.id, series.consequenceId));
  if (!c) return null;
  const date = addDays(localDate(now, series.timezone), series.consequenceDueDays);
  // A time that has already passed today would make it overdue on arrival; give it the rest of the day instead.
  const dueTime = series.consequenceDueTime && dueInstant(date, series.consequenceDueTime, series.timezone) > now ? series.consequenceDueTime : null;
  const day = occ.dueAt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: series.timezone });
  return issueConsequence(
    db,
    c,
    {
      assigneeId: series.assigneeId,
      date,
      dueTime,
      timezone: series.timezone,
      reason: `Missed “${series.title}” on ${day}`,
      approvalRequired: series.approvalRequired,
      createdBy: series.createdBy,
      causedBy: occ.id,
    },
    now,
  );
}

/** Takes back the automatic consequence for an occurrence that's no longer missed, if it hasn't been dealt with yet. */
async function withdrawMissConsequence(db: Tx, occ: Occurrence) {
  const issued = await db
    .update(taskSeries)
    .set({ active: false, updatedAt: new Date() })
    .where(and(eq(taskSeries.causedByOccurrenceId, occ.id), eq(taskSeries.active, true)))
    .returning({ id: taskSeries.id });
  if (issued.length)
    await db
      .update(occurrences)
      .set({ status: "cancelled" })
      .where(
        and(
          inArray(
            occurrences.seriesId,
            issued.map((s) => s.id),
          ),
          eq(occurrences.status, "pending"),
        ),
      );
}

/** Marks pending occurrences past due + grace as missed, applies penalties and hands out any consequence. Returns what changed. */
export async function markMissed(db: Tx, now: Date) {
  const overdue = await db
    .select({ occ: occurrences, series: taskSeries })
    .from(occurrences)
    .innerJoin(taskSeries, eq(occurrences.seriesId, taskSeries.id))
    .where(and(eq(occurrences.status, "pending"), sql`${occurrences.dueAt} + make_interval(mins => ${taskSeries.graceMinutes}) <= ${now.toISOString()}::timestamptz`));
  const missed: { occ: Occurrence; series: Series; consequence: Series | null }[] = [];
  for (const { occ, series } of overdue) {
    const [updated] = await db
      .update(occurrences)
      .set({ status: "missed", missConfirmedAt: null })
      .where(and(eq(occurrences.id, occ.id), eq(occurrences.status, "pending")))
      .returning();
    if (!updated) continue;
    if (series.missPenalty > 0 && (await pointsEnabled(db, series.relationshipId))) {
      await db
        .insert(pointsLedger)
        .values({
          relationshipId: series.relationshipId,
          userId: series.assigneeId,
          delta: -series.missPenalty,
          kind: "miss",
          note: series.title,
          occurrenceId: occ.id,
        })
        .onConflictDoNothing();
    }
    // A missed chore shouldn't vanish: count the next one from when it was due.
    await advanceCompletionSeries(db, series, localDate(occ.dueAt, series.timezone));
    missed.push({ occ: updated, series, consequence: await issueMissConsequence(db, series, updated, now) });
  }
  return missed;
}

/** Pending occurrences due within `leadMinutes` that haven't had a reminder yet; marks them reminded. */
export async function claimReminders(db: Tx, now: Date, leadMinutes: number) {
  const horizon = new Date(now.getTime() + leadMinutes * 60_000);
  const due = await db
    .update(occurrences)
    .set({ reminderSentAt: now })
    .where(and(eq(occurrences.status, "pending"), isNull(occurrences.reminderSentAt), lte(occurrences.dueAt, horizon), gte(occurrences.dueAt, now)))
    .returning();
  if (due.length === 0) return [];
  const series = await db
    .select()
    .from(taskSeries)
    .where(inArray(taskSeries.id, [...new Set(due.map((o) => o.seriesId))]));
  const byId = new Map(series.map((s) => [s.id, s]));
  return due.map((occ) => ({ occ, series: byId.get(occ.seriesId)! }));
}

export interface RescheduleChange {
  scope: "this" | "following";
  delayHours?: number;
  dueAt?: string;
  reason?: string;
}

export function targetDue(series: Series, occ: Occurrence, change: RescheduleChange): Date {
  if (change.delayHours !== undefined) return delayDue(occ.dueAt, change.delayHours, series.timezone);
  const due = new Date(change.dueAt!);
  if (Number.isNaN(due.getTime())) throw new HttpError(400, "invalid dueAt");
  return due;
}

/** Undo a miss penalty when a missed occurrence is reopened by rescheduling. */
async function reopenIfMissed(db: Tx, series: Series, occ: Occurrence) {
  if (occ.status !== "missed") return;
  await withdrawMissConsequence(db, occ);
  const [penalty] = await db
    .select()
    .from(pointsLedger)
    .where(and(eq(pointsLedger.occurrenceId, occ.id), eq(pointsLedger.kind, "miss")));
  if (penalty) {
    await db.insert(pointsLedger).values({
      relationshipId: series.relationshipId,
      userId: series.assigneeId,
      delta: -penalty.delta,
      kind: "adjustment",
      note: `Miss reversed by reschedule: ${series.title}`,
    });
  }
}

/** Moves an occurrence (or it and the rest of its series). Returns the occurrence now holding that slot. */
export async function applyReschedule(db: Tx, series: Series, occ: Occurrence, scope: "this" | "following", toDue: Date, now: Date, materializeDays: number): Promise<Occurrence> {
  await reopenIfMissed(db, series, occ);
  const followingApplies = scope === "following" && series.schedule.rule && series.schedule.anchor !== "completion";
  if (!followingApplies) {
    const [moved] = await db.update(occurrences).set({ dueAt: toDue, status: "pending", reminderSentAt: null }).where(eq(occurrences.id, occ.id)).returning();
    return moved!;
  }

  const zone = series.timezone;
  const newStart = localDate(toDue, zone);
  const newDueTime = series.dueTime === null && isEndOfLocalDay(toDue, zone) ? null : localTime(toDue, zone);
  if (newStart < occ.originalDate) throw new HttpError(400, "moving a series earlier isn't supported; edit the task's schedule instead");
  const { before, after } = splitSeries(series.schedule, occ.originalDate, newStart);

  const { id: _id, createdAt: _c, updatedAt: _u, supersededBy: _s, ...copy } = series;
  const [next] = await db
    .insert(taskSeries)
    .values({ ...copy, schedule: after, dueTime: newDueTime, active: true })
    .returning();
  await db
    .update(taskSeries)
    .set(before ? { schedule: before, supersededBy: next!.id, updatedAt: now } : { active: false, supersededBy: next!.id, updatedAt: now })
    .where(eq(taskSeries.id, series.id));
  await db
    .update(occurrences)
    .set({ status: "cancelled" })
    .where(and(eq(occurrences.seriesId, series.id), gte(occurrences.originalDate, occ.originalDate), inArray(occurrences.status, ["pending", "missed"])));
  await materializeSeries(db, next!, addDays(maxDate(newStart, localDate(now, zone)), materializeDays), now);
  const [first] = await db
    .select()
    .from(occurrences)
    .where(and(eq(occurrences.seriesId, next!.id), eq(occurrences.originalDate, newStart)));
  if (!first) throw new HttpError(500, "rescheduled series produced no occurrence");
  return first;
}

/**
 * Whether the actor's reschedule applies directly. Dominants and switches always may; submissives
 * follow the relationship's policy. Under `allowance`, a whole-day request counts as one delay.
 */
async function rescheduleAuthority(db: Tx, rel: Relationship, actor: { userId: string; role: Role }, now: Date) {
  if (canManage(actor.role)) return { direct: true, usedAllowance: false };
  if (rel.reschedulePolicy === "dominant_only") throw forbidden("only a Dominant can reschedule tasks");
  if (rel.reschedulePolicy === "allowance") {
    const [{ n }] = (await db
      .select({ n: sql<number>`count(distinct coalesce(${reschedules.groupId}, ${reschedules.id}))::int` })
      .from(reschedules)
      .where(
        and(
          eq(reschedules.requestedBy, actor.userId),
          eq(reschedules.relationshipId, rel.id),
          eq(reschedules.usedAllowance, true),
          gte(reschedules.createdAt, new Date(now.getTime() - 7 * 86_400_000)),
        ),
      )) as [{ n: number }];
    if (n < rel.weeklyDelayAllowance) return { direct: true, usedAllowance: true };
  }
  return { direct: false, usedAllowance: false };
}

/**
 * Applies a reschedule directly when the actor may, or files a request for a Dominant to decide.
 * Dominants and switches always may. Submissives follow the relationship's policy.
 */
export async function requestReschedule(
  db: Tx,
  rel: Relationship,
  series: Series,
  occ: Occurrence,
  actor: { userId: string; role: Role },
  change: RescheduleChange,
  now: Date,
  materializeDays: number,
) {
  if (occ.status !== "pending" && occ.status !== "missed") throw new HttpError(409, `occurrence is ${occ.status}`);
  if (!canManage(actor.role) && actor.userId !== series.assigneeId) throw forbidden();
  const toDue = targetDue(series, occ, change);
  if (toDue.getTime() <= now.getTime()) throw new HttpError(400, "the new deadline must be in the future");

  const { direct, usedAllowance } = await rescheduleAuthority(db, rel, actor, now);

  const [request] = await db
    .insert(reschedules)
    .values({
      occurrenceId: occ.id,
      relationshipId: rel.id,
      requestedBy: actor.userId,
      scope: change.scope,
      fromDueAt: occ.dueAt,
      toDueAt: toDue,
      reason: change.reason ?? null,
      status: direct ? "applied" : "requested",
      usedAllowance,
      decidedBy: direct ? actor.userId : null,
      decidedAt: direct ? now : null,
    })
    .returning();
  if (!direct) return { applied: false, request: request!, occurrence: occ };
  const occurrence = await applyReschedule(db, series, occ, change.scope, toDue, now, materializeDays);
  return { applied: true, request: request!, occurrence };
}

/**
 * "More time for the whole day": one request covering several occurrences, each delayed by the
 * same number of hours. Applied or decided as a unit.
 */
export async function requestGroupReschedule(
  db: Tx,
  rel: Relationship,
  items: { series: Series; occ: Occurrence }[],
  actor: { userId: string; role: Role },
  delayHours: number,
  reason: string | undefined,
  now: Date,
  materializeDays: number,
) {
  if (items.length === 0) throw new HttpError(400, "nothing to reschedule");
  for (const { series, occ } of items) {
    if (series.relationshipId !== rel.id) throw new HttpError(400, "all tasks must belong to this relationship");
    if (occ.status !== "pending" && occ.status !== "missed") throw new HttpError(409, `occurrence is ${occ.status}`);
    if (!canManage(actor.role) && actor.userId !== series.assigneeId) throw forbidden();
  }
  const { direct, usedAllowance } = await rescheduleAuthority(db, rel, actor, now);
  const groupId = randomUUID();
  const requests = await db
    .insert(reschedules)
    .values(
      items.map(({ series, occ }) => ({
        occurrenceId: occ.id,
        relationshipId: rel.id,
        groupId,
        requestedBy: actor.userId,
        scope: "this" as const,
        fromDueAt: occ.dueAt,
        toDueAt: delayDue(occ.dueAt, delayHours, series.timezone),
        reason: reason ?? null,
        status: direct ? ("applied" as const) : ("requested" as const),
        usedAllowance,
        decidedBy: direct ? actor.userId : null,
        decidedAt: direct ? now : null,
      })),
    )
    .returning();
  if (!direct) return { applied: false, groupId, requests, occurrences: items.map((i) => i.occ) };
  const moved: Occurrence[] = [];
  for (const [i, { series, occ }] of items.entries()) moved.push(await applyReschedule(db, series, occ, "this", requests[i]!.toDueAt, now, materializeDays));
  return { applied: true, groupId, requests, occurrences: moved };
}

/** Decides a request, or every pending request in its group. Returns the decided rows and their occurrences. */
/**
 * Calls an occurrence off. One still to come is cancelled, so it drops out of Today and the calendar as if deleted
 * (the row stays so the series doesn't recreate it) and shows only in history. A missed one becomes excused, with any
 * miss consequence and points undone.
 */
export async function callOffOccurrence(db: Tx, series: Series, occ: Occurrence, editorId: string, now: Date): Promise<Occurrence> {
  if (occ.status === "missed") return editOccurrence(db, series, occ, editorId, { status: "excused" }, now);
  if (occ.status !== "pending") throw new HttpError(409, `occurrence is ${occ.status}`);
  const [updated] = await db.update(occurrences).set({ status: "cancelled", calledOff: true, editedBy: editorId, editedAt: now }).where(eq(occurrences.id, occ.id)).returning();
  return updated!;
}

/**
 * The tasks a plan runs into, sorted out one by one: some moved, some called off. A Dominant's choices apply at once.
 * A sub's moves follow the reschedule policy; asking to call a task off always goes to a Dominant. Whatever needs a
 * decision shares one group.
 */
export async function requestPlanReschedule(
  db: Tx,
  rel: Relationship,
  items: { series: Series; occ: Occurrence; action: "move" | "cancel"; dueAt?: Date }[],
  actor: { userId: string; role: Role },
  reason: string | undefined,
  now: Date,
  materializeDays: number,
) {
  if (items.length === 0) throw new HttpError(400, "nothing to sort out");
  for (const { series, occ, action, dueAt } of items) {
    if (series.relationshipId !== rel.id) throw new HttpError(400, "all tasks must belong to this relationship");
    if (occ.status !== "pending" && occ.status !== "missed") throw new HttpError(409, `occurrence is ${occ.status}`);
    if (!canManage(actor.role) && actor.userId !== series.assigneeId) throw forbidden();
    if (action === "move" && (!dueAt || dueAt.getTime() <= now.getTime())) throw new HttpError(400, "the new deadline must be in the future");
  }
  const { direct, usedAllowance } = await rescheduleAuthority(db, rel, actor, now);
  const manager = canManage(actor.role);
  const groupId = randomUUID();
  const requests: (typeof reschedules.$inferSelect)[] = [];
  const result: Occurrence[] = [];
  for (const { series, occ, action, dueAt } of items) {
    const now_ = action === "cancel" ? manager : direct;
    const [request] = await db
      .insert(reschedules)
      .values({
        occurrenceId: occ.id,
        relationshipId: rel.id,
        groupId,
        requestedBy: actor.userId,
        scope: "this",
        kind: action,
        fromDueAt: occ.dueAt,
        toDueAt: action === "move" ? dueAt! : occ.dueAt,
        reason: reason ?? null,
        status: now_ ? "applied" : "requested",
        usedAllowance: now_ && action === "move" && usedAllowance,
        decidedBy: now_ ? actor.userId : null,
        decidedAt: now_ ? now : null,
      })
      .returning();
    requests.push(request!);
    if (!now_) result.push(occ);
    else if (action === "cancel") result.push(await callOffOccurrence(db, series, occ, actor.userId, now));
    else result.push(await applyReschedule(db, series, occ, "this", dueAt!, now, materializeDays));
  }
  return { groupId, requests, occurrences: result, asked: requests.filter((r) => r.status === "requested").length };
}

export async function decideReschedule(
  db: Tx,
  request: typeof reschedules.$inferSelect,
  deciderId: string,
  approve: boolean,
  now: Date,
  materializeDays: number,
  opts: { dueAt?: Date; item?: boolean } = {},
) {
  if (request.status !== "requested") throw new HttpError(409, `request is ${request.status}`);
  if (opts.dueAt && opts.dueAt.getTime() <= now.getTime()) throw new HttpError(400, "the new deadline must be in the future");
  const pending =
    request.groupId && !opts.item && !opts.dueAt
      ? await db
          .select()
          .from(reschedules)
          .where(and(eq(reschedules.groupId, request.groupId), eq(reschedules.status, "requested")))
      : [request];
  const decided = await db
    .update(reschedules)
    .set({
      status: approve ? "approved" : "declined",
      decidedBy: deciderId,
      decidedAt: now,
      // "Reschedule instead": the Dominant picks the new deadline, whatever was asked.
      ...(opts.dueAt && { kind: "move" as const, toDueAt: opts.dueAt }),
    })
    .where(
      inArray(
        reschedules.id,
        pending.map((r) => r.id),
      ),
    )
    .returning();
  const results: { request: typeof reschedules.$inferSelect; occurrence: Occurrence; series: Series }[] = [];
  for (const r of decided) {
    const [row] = await db
      .select({ occ: occurrences, series: taskSeries })
      .from(occurrences)
      .innerJoin(taskSeries, eq(occurrences.seriesId, taskSeries.id))
      .where(eq(occurrences.id, r.occurrenceId));
    let occurrence = row!.occ;
    // An occurrence completed or cancelled since the request simply stays as it is.
    if (approve && (occurrence.status === "pending" || occurrence.status === "missed"))
      occurrence =
        r.kind === "cancel"
          ? await callOffOccurrence(db, row!.series, occurrence, deciderId, now)
          : await applyReschedule(db, row!.series, occurrence, r.scope, r.toDueAt, now, materializeDays);
    results.push({ request: r, occurrence, series: row!.series });
  }
  return results;
}
