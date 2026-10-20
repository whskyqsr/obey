import { describe, opensOn } from "@obey/recurrence";
import type { consequences, notes, occurrences, pointsLedger, protocols, reschedules, rewards, rules, taskSeries } from "./db/schema.js";

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
  summary: describe(s.schedule),
  assignedConsequenceId: s.assignedConsequenceId,
  active: s.active,
  createdBy: s.createdBy,
  createdAt: iso(s.createdAt),
});

export const occurrenceDto = (o: typeof occurrences.$inferSelect, s: Series) => ({
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
  noteMd: o.noteMd,
  opensOn: opensOn(s.schedule, o.originalDate),
  photoCount: o.photoCount,
  commentCount: o.commentCount,
  proofRequired: s.proofRequired,
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

export const ledgerDto = (l: typeof pointsLedger.$inferSelect) => ({
  id: l.id,
  userId: l.userId,
  delta: l.delta,
  kind: l.kind,
  note: l.note,
  createdBy: l.createdBy,
  createdAt: iso(l.createdAt),
});

type Library = typeof rewards.$inferSelect | typeof consequences.$inferSelect | typeof rules.$inferSelect | typeof protocols.$inferSelect;
export const libraryDto = <T extends Library>(row: T) => ({ ...row, createdAt: iso(row.createdAt) });

export const noteDto = (n: typeof notes.$inferSelect, canEdit: boolean) => ({
  ...n,
  canEdit,
  createdAt: iso(n.createdAt),
  updatedAt: iso(n.updatedAt),
});
