// Request and response shapes shared by the API and the web app.
// The Android app mirrors these by hand in apps/android (see its api/Models.kt).
import { z } from "zod";
import { WEEKDAYS, validateSchedule } from "@obey/recurrence";

export const plainDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
export const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:mm");
export const id = z.string().uuid();

export const recurrenceRule = z.object({
  freq: z.enum(["daily", "weekly", "monthly", "yearly", "cycle"]),
  interval: z.number().int().positive().optional(),
  byWeekday: z.array(z.enum(WEEKDAYS)).optional(),
  byMonthDay: z.array(z.number().int()).optional(),
  nth: z.number().int().optional(),
  cycleLength: z.number().int().positive().optional(),
  cycleDays: z.array(z.number().int()).optional(),
  count: z.number().int().positive().optional(),
  until: plainDate.optional(),
});

export const schedule = z
  .object({
    start: plainDate,
    rule: recurrenceRule.optional(),
    anchor: z.enum(["calendar", "completion"]).optional(),
  })
  .superRefine((s, ctx) => {
    for (const message of validateSchedule(s)) ctx.addIssue({ code: "custom", message });
  });

export const role = z.enum(["dominant", "submissive", "switch"]);
export type Role = z.infer<typeof role>;

/** Who may move a deadline. `request`: the sub asks and the Dom approves. `allowance`: N free delays per week. */
export const reschedulePolicy = z.enum(["dominant_only", "request", "allowance"]);

/** Changes whenever the picture does; null when there is none. Fetch it from /users/:id/avatar. */
const avatarVersion = z.string().nullable();
/** Parts of the app a dynamic can switch off. Points covers rewards too; tasks and notes are always on. */
export const FEATURES = ["points", "consequences", "rules", "protocols", "journal"] as const;
export const features = z.object(Object.fromEntries(FEATURES.map((f) => [f, z.boolean()])) as Record<(typeof FEATURES)[number], z.ZodBoolean>);
export type Features = z.infer<typeof features>;
export const allFeatures = (stored: Partial<Features> = {}): Features => Object.fromEntries(FEATURES.map((f) => [f, stored[f] ?? true])) as Features;

/** The day calendars start their week on, per person. */
export const weekStart = z.enum(["sun", "mon"]);
export type WeekStart = z.infer<typeof weekStart>;

export const user = z.object({ id, displayName: z.string(), email: z.string().nullable(), avatarVersion, weekStart });
export type User = z.infer<typeof user>;

export const member = z.object({ userId: id, displayName: z.string(), role, avatarVersion });
export const relationship = z.object({
  id,
  /** Optional; apps show the partners' names instead. */
  name: z.string().nullable(),
  members: z.array(member),
  reschedulePolicy,
  weeklyDelayAllowance: z.number().int().nonnegative(),
  features,
  /** Whether a submissive may write notes of their own. Dominants always can. */
  subNotes: z.boolean(),
  createdAt: z.string(),
});
export type Relationship = z.infer<typeof relationship>;

export const me = z.object({ user, relationships: z.array(relationship) });
export type Me = z.infer<typeof me>;

export const updateMe = z.object({ displayName: z.string().trim().min(1).max(40).optional(), weekStart: weekStart.optional() });

// A blank name means "no name": apps then show the partners' names.
const relationshipName = z
  .string()
  .trim()
  .max(80)
  .nullish()
  .transform((s) => s || null);
export const createRelationship = z.object({ name: relationshipName, role });
/** `role` is what the person joining becomes; null lets them choose. */
export const invite = z.object({ code: z.string(), expiresAt: z.string(), role: role.nullable().default(null) });
export const createInvite = z.object({ role: role.nullable().optional() });
/** What an invite link shows before it's accepted. */
export const invitePreview = z.object({
  code: z.string(),
  relationshipId: z.string().uuid(),
  inviterName: z.string(),
  role: role.nullable(),
  alreadyMember: z.boolean(),
});
/** `role` is used only when the invite leaves it to the person joining. */
export const joinRelationship = z.object({ code: z.string().min(4), role: role.optional() });
export const updateRelationship = z.object({
  name: relationshipName.optional(),
  reschedulePolicy: reschedulePolicy.optional(),
  weeklyDelayAllowance: z.number().int().min(0).max(50).optional(),
  features: features.partial().optional(),
  subNotes: z.boolean().optional(),
});

export const taskInput = z.object({
  title: z.string().min(1).max(200),
  bodyMd: z.string().max(20_000).default(""),
  assigneeId: id,
  points: z.number().int().min(-10_000).max(10_000).default(0),
  missPenalty: z.number().int().min(0).max(10_000).default(0),
  rewardId: id.nullable().default(null),
  consequenceId: id.nullable().default(null),
  /** When a consequence handed out for a miss is due: this many days after the miss is recorded (0 = that day), by consequenceDueTime or all day. */
  consequenceDueDays: z.number().int().min(0).max(30).default(1),
  consequenceDueTime: timeOfDay.nullable().default(null),
  proofRequired: z.boolean().default(false),
  approvalRequired: z.boolean().default(false),
  schedule,
  dueTime: timeOfDay.nullable().default(null),
  timezone: z.string().min(1),
  graceMinutes: z
    .number()
    .int()
    .min(0)
    .max(60 * 24 * 7)
    .default(0),
});
export type TaskInput = z.input<typeof taskInput>;

export const task = taskInput.extend({
  id,
  relationshipId: id,
  summary: z.string(),
  /** Set when this task is a consequence assigned on its own, not a regular task. */
  assignedConsequenceId: id.nullable().default(null),
  active: z.boolean(),
  createdBy: id,
  createdAt: z.string(),
});
export type Task = z.infer<typeof task>;

export const occurrenceStatus = z.enum(["pending", "submitted", "completed", "missed", "excused", "cancelled"]);
export type OccurrenceStatus = z.infer<typeof occurrenceStatus>;

export const occurrence = z.object({
  id,
  seriesId: id,
  title: z.string(),
  assigneeId: id,
  points: z.number().int(),
  originalDate: plainDate,
  dueAt: z.string(),
  rescheduled: z.boolean(),
  status: occurrenceStatus,
  completedAt: z.string().nullable(),
  noteMd: z.string().nullable(),
  /** The first day the assignee may complete it (the day after the previous occurrence); null when any time is fine. */
  opensOn: plainDate.nullable().default(null),
});
export type Occurrence = z.infer<typeof occurrence>;

/** How a task has gone over its whole history. `rate` is done / (done + missed), null before anything is due. */
export const taskStats = z.object({
  done: z.number().int(),
  missed: z.number().int(),
  excused: z.number().int(),
  rate: z.number().nullable(),
  streak: z.number().int(),
  bestStreak: z.number().int(),
  lastDoneAt: z.string().nullable(),
});
export type TaskStats = z.infer<typeof taskStats>;

/** A task's current streak and its last few finished occurrences, oldest first, for the strip on task cards. */
export const taskStreak = z.object({
  taskId: id,
  streak: z.number().int(),
  recent: z.array(z.enum(["completed", "missed", "excused"])),
});
export type TaskStreak = z.infer<typeof taskStreak>;

/** One past occurrence in a task's history, with the points it earned or cost. */
export const historyEntry = occurrence.extend({
  pointsDelta: z.number().int(),
  /** Set when a Dominant corrected the entry by hand. */
  editedBy: id.nullable(),
  editedAt: z.string().nullable(),
});
export type HistoryEntry = z.infer<typeof historyEntry>;

/** A Dominant's correction to a past occurrence. Points follow the new status. */
export const editOccurrence = z.object({
  status: z.enum(["completed", "missed", "excused"]).optional(),
  completedAt: z.string().datetime({ offset: true }).optional(),
  noteMd: z.string().max(5_000).nullable().optional(),
});

export const completeOccurrence = z.object({ noteMd: z.string().max(5_000).optional() });
export const reviewOccurrence = z.object({ approve: z.boolean(), noteMd: z.string().max(5_000).optional() });

export const rescheduleInput = z
  .object({
    scope: z.enum(["this", "following"]).default("this"),
    delayHours: z
      .number()
      .int()
      .min(1)
      .max(24 * 60)
      .optional(),
    dueAt: z.string().datetime({ offset: true }).optional(),
    reason: z.string().max(1_000).optional(),
  })
  .refine((r) => (r.delayHours === undefined) !== (r.dueAt === undefined), {
    message: "give exactly one of delayHours or dueAt",
  });
export type RescheduleInput = z.input<typeof rescheduleInput>;

/** "More time for the whole day": delay several occurrences together; decided as one request. */
export const rescheduleDayInput = z.object({
  occurrenceIds: z.array(id).min(1).max(50),
  delayHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 60),
  reason: z.string().max(1_000).optional(),
});
export type RescheduleDayInput = z.input<typeof rescheduleDayInput>;

export const rescheduleRequest = z.object({
  id,
  groupId: id.nullable(),
  occurrenceId: id,
  title: z.string(),
  requestedBy: id,
  scope: z.enum(["this", "following"]),
  fromDueAt: z.string(),
  toDueAt: z.string(),
  reason: z.string().nullable(),
  status: z.enum(["requested", "approved", "declined", "applied"]),
  createdAt: z.string(),
});
export type RescheduleRequest = z.infer<typeof rescheduleRequest>;

export const ledgerEntry = z.object({
  id,
  userId: id,
  delta: z.number().int(),
  kind: z.enum(["completion", "miss", "redemption", "adjustment", "delay"]),
  note: z.string(),
  createdBy: id.nullable(),
  createdAt: z.string(),
});
export type LedgerEntry = z.infer<typeof ledgerEntry>;

export const adjustPoints = z.object({ userId: id, delta: z.number().int(), note: z.string().min(1).max(500) });

export const rewardInput = z.object({
  title: z.string().min(1).max(200),
  bodyMd: z.string().max(5_000).default(""),
  cost: z.number().int().min(0),
  needsApproval: z.boolean().default(true),
});
export const reward = rewardInput.extend({ id, relationshipId: id, createdAt: z.string() });

export const consequenceInput = z.object({
  title: z.string().min(1).max(200),
  bodyMd: z.string().max(5_000).default(""),
  severity: z.number().int().min(1).max(5).default(1),
});
export const consequence = consequenceInput.extend({ id, relationshipId: id, createdAt: z.string() });

/** Hands out a consequence on its own: it becomes a one-off task due on `date`. */
export const assignConsequence = z.object({
  assigneeId: id,
  date: plainDate,
  dueTime: timeOfDay.nullable().default(null),
  timezone: z.string().min(1),
  reason: z.string().trim().max(2_000).default(""),
  approvalRequired: z.boolean().default(false),
});

export const ruleInput = z.object({
  title: z.string().min(1).max(200),
  bodyMd: z.string().max(5_000).default(""),
  category: z.string().max(60).nullable().default(null),
  position: z.number().int().min(0).default(0),
});
export const rule = ruleInput.extend({ id, relationshipId: id, createdAt: z.string() });

/** The specifics behind a rule: what exactly is expected, and when and how it's done. */
export const protocolInput = z.object({
  title: z.string().min(1).max(200),
  bodyMd: z.string().max(20_000).default(""),
  /** The rule this protocol spells out, if any. */
  ruleId: id.nullable().default(null),
  position: z.number().int().min(0).default(0),
});
export const protocol = protocolInput.extend({ id, relationshipId: id, createdAt: z.string() });

/** A full ordering of a relationship's rules or protocols, top first. */
export const reorderInput = z.object({ ids: z.array(id).max(1000) });

export const noteVisibility = z.enum(["private", "shared"]);
export const noteInput = z.object({
  kind: z.enum(["note", "journal"]).default("note"),
  title: z.string().max(200).default(""),
  bodyMd: z.string().max(100_000),
  visibility: noteVisibility.default("shared"),
  tags: z.array(z.string().min(1).max(40)).max(20).default([]),
  pinned: z.boolean().default(false),
  mood: z.number().int().min(1).max(5).nullable().default(null),
  /** On a shared note by a Dominant: the submissive may edit its title, text and tags too. */
  subCanEdit: z.boolean().default(false),
});
export const note = noteInput.extend({
  id,
  relationshipId: id,
  authorId: id,
  /** Whether the person asking may change this note. */
  canEdit: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Note = z.infer<typeof note>;

export const registerDevice = z.object({ token: z.string().min(10), platform: z.enum(["android", "web"]) });

export const apiError = z.object({ error: z.string(), details: z.unknown().optional() });
