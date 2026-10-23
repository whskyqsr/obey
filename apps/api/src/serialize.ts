import { describe, opensOn } from "@obey/recurrence";
import type { consequences, notes, occurrences, pointsLedger, protocols, reschedules, rewards, rules, taskSeries } from "./db/schema.js";
import { stayEnd } from "./services/location.js";

const iso = (d: Date) => d.toISOString();
const isoOrNull = (d: Date | null) => (d ? d.toISOString() : null);

type Series = typeof taskSeries.$inferSelect;

export const taskDto = (s: Series) => ({
  id: s.id,
  relationshipId: s.relationshipId,
  title: s.title,
  bodyMd: s.bodyMd,
  assigneeId: s.assigneeId,
  points: s.points,
  missPenalty: s.missPenalty,
  rewardId: s.rewardId,
  consequenceId: s.consequenceId,
  consequenceDueDays: s.consequenceDueDays,
  consequenceDueTime: s.consequenceDueTime,
  proofRequired: s.proofRequired,
  approvalRequired: s.approvalRequired,
  schedule: s.schedule,
  dueTime: s.dueTime,
  timezone: s.timezone,
  graceMinutes: s.graceMinutes,
  steps: s.steps,
  windowMinutes: s.windowMinutes,
  askMood: s.askMood,
  asksJournal: s.asksJournal,
  countMin: s.countMin,
  countMax: s.countMax,
  countPer: s.countPer,
  placeId: s.placeId,
  stayMinutes: s.stayMinutes,
  reminder: s.reminder,
  reminderText: s.reminderText,
  summary: describe(s.schedule),
  assignedConsequenceId: s.assignedConsequenceId,
  active: s.active,
  draft: s.draft,
  createdBy: s.createdBy,
  createdAt: iso(s.createdAt),
});

export const occurrenceDto = (o: typeof occurrences.$inferSelect, s: Series, missConsequence: string | null = null) => ({
  id: o.id,
  seriesId: o.seriesId,
  title: s.title,
  assigneeId: s.assigneeId,
  points: s.points,
  originalDate: o.originalDate,
  dueAt: iso(o.dueAt),
  rescheduled: o.dueAt.getTime() !== o.originalDueAt.getTime() || s.supersededBy !== null,
  status: o.status,
  completedAt: isoOrNull(o.completedAt),
  syncedAt: isoOrNull(o.syncedAt),
  noteMd: o.noteMd,
  opensOn: opensOn(s.schedule, o.originalDate),
  photoCount: o.photoCount,
  commentCount: o.commentCount,
  proofRequired: s.proofRequired,
  steps: s.steps,
  // Only ids still in the ritual count; a step removed after it was ticked drops out.
  stepsDone: o.stepsDone.filter((id) => s.steps.some((st) => st.id === id)),
  opensAt: s.windowMinutes ? iso(new Date(o.dueAt.getTime() - s.windowMinutes * 60_000)) : null,
  askMood: s.askMood,
  mood: o.mood,
  asksJournal: s.asksJournal,
  journalPrompt: s.asksJournal ? s.bodyMd : null,
  journalNoteId: o.journalNoteId,
  missConfirmed: o.missConfirmedAt !== null,
  moodSeen: o.moodSeenAt !== null,
  missConsequence,
  countMin: s.countMin,
  countMax: s.countMax,
  countPer: s.countPer,
  count: o.count,
  placeId: s.placeId,
  stayMinutes: s.placeId ? s.stayMinutes : null,
  arrivedAt: isoOrNull(o.arrivedAt),
  leftAt: isoOrNull(o.leftAt),
  stayUntil: s.placeId ? isoOrNull(stayEnd(s, o)) : null,
  curfew: s.curfewUntil !== null,
  consequence: s.assignedConsequenceId !== null || s.causedByOccurrenceId !== null,
});

/** `title` is the task's, so a request card can say which task it's about. */
export const rescheduleDto = (r: typeof reschedules.$inferSelect, title: string) => ({
  id: r.id,
  groupId: r.groupId,
  occurrenceId: r.occurrenceId,
  title,
  requestedBy: r.requestedBy,
  scope: r.scope,
  kind: r.kind,
  fromDueAt: iso(r.fromDueAt),
  toDueAt: iso(r.toDueAt),
  reason: r.reason,
  status: r.status,
  createdAt: iso(r.createdAt),
});

export const ledgerDto = (l: typeof pointsLedger.$inferSelect, consequenceTitle: string | null = null) => ({
  id: l.id,
  userId: l.userId,
  delta: l.delta,
  kind: l.kind,
  note: l.note,
  createdBy: l.createdBy,
  createdAt: iso(l.createdAt),
  rewardId: l.rewardId,
  occurrenceId: l.occurrenceId,
  consequenceTitle: l.kind === "redemption" ? consequenceTitle : null,
  redeemedAt: isoOrNull(l.redeemedAt),
  redeemedBy: l.redeemedBy,
  redeemNote: l.redeemNote,
});

type Library = typeof rewards.$inferSelect | typeof consequences.$inferSelect | typeof rules.$inferSelect | typeof protocols.$inferSelect;
export const libraryDto = <T extends Library>(row: T) => ({ ...row, createdAt: iso(row.createdAt) });

export const noteDto = (n: typeof notes.$inferSelect, canEdit: boolean) => ({
  ...n,
  canEdit,
  createdAt: iso(n.createdAt),
  updatedAt: iso(n.updatedAt),
});
