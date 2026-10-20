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

/** When pushes arrive without sound or vibration; start may be after end, which spans midnight. */
export const quietHours = z.object({ start: timeOfDay, end: timeOfDay, timezone: z.string().min(1).max(64) });
export type QuietHours = z.infer<typeof quietHours>;

/** Kinds of notification a person can turn off; anything about the dynamic itself always comes through. */
export const notifyCategory = z.enum(["reminders", "completions", "missed", "requests", "comments", "assigned", "plans", "rewards"]);
export type NotifyCategory = z.infer<typeof notifyCategory>;

export const user = z.object({
  id,
  displayName: z.string(),
  email: z.string().nullable(),
  avatarVersion,
  weekStart,
  /** Confirmed 18+ and accepted the rules for proof photos; needed before the first upload. */
  proofTermsAccepted: z.boolean().default(false),
  /** Show proof photos without the blur. */
  revealProofs: z.boolean().default(false),
  quietHours: quietHours.nullable().default(null),
  /** Notification kinds this person turned off. */
  mutedNotifications: z.array(notifyCategory).default([]),
});
export type User = z.infer<typeof user>;

/** A date the dynamic marks: an anniversary, a collaring, or anything else it names. */
export const dynamicDate = z.object({ id: z.string().min(1).max(40), label: z.string().trim().min(1).max(40), date: plainDate });
export type DynamicDate = z.infer<typeof dynamicDate>;

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
  dates: z.array(dynamicDate),
  createdAt: z.string(),
  /** When a partner left or blocked; an ended dynamic is kept read-only for both. */
  endedAt: z.string().nullable(),
  endedBy: id.nullable(),
});
export type Relationship = z.infer<typeof relationship>;

/** Leaving ends the dynamic for both; `block` names the people who may never pair with you again. */
export const leaveRelationship = z.object({ block: z.array(id).max(20).default([]) });

export const me = z.object({
  user,
  relationships: z.array(relationship),
  /** Reviews reports (a verified email in the API's ADMIN_EMAILS). */
  admin: z.boolean().default(false),
});
export type Me = z.infer<typeof me>;

export const updateMe = z.object({
  displayName: z.string().trim().min(1).max(40).optional(),
  weekStart: weekStart.optional(),
  revealProofs: z.boolean().optional(),
  /** null turns quiet hours off. */
  quietHours: quietHours.nullable().optional(),
  mutedNotifications: z.array(notifyCategory).max(20).optional(),
});
/** Both boxes must be ticked; there is no way to upload a proof photo without them. */
export const acceptProofTerms = z.object({ adult: z.literal(true), rules: z.literal(true) });

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
  /** The whole list, replacing what's stored. */
  dates: z.array(dynamicDate).max(20).optional(),
});

/** One step of a ritual. Ids are made by the client and only need to be unique within the task. */
export const taskStep = z.object({ id: z.string().min(1).max(40), title: z.string().trim().min(1).max(200) });
export type TaskStep = z.infer<typeof taskStep>;

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
  /** A ritual's steps, done in order in a run view. Empty for an ordinary task. */
  steps: z
    .array(taskStep)
    .max(30)
    .refine((a) => new Set(a.map((s) => s.id)).size === a.length, "step ids must be unique")
    .default([]),
  /** Only doable in the last this-many minutes before it's due ("opens 30 minutes before"); null for any time. */
  windowMinutes: z
    .number()
    .int()
    .min(5)
    .max(60 * 24)
    .nullable()
    .default(null),
  /** A check-in: marking it done asks the assignee for a mood. */
  askMood: z.boolean().default(false),
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
  photoCount: z.number().int().default(0),
  commentCount: z.number().int().default(0),
  /** The task needs a photo or a note before it can be marked done. */
  proofRequired: z.boolean().default(false),
  /** The ritual's steps (empty for an ordinary task) and the ids ticked off so far. */
  steps: z.array(taskStep).default([]),
  stepsDone: z.array(z.string()).default([]),
  /** The moment the assignee may start it, when the task has a window; null when any time that day is fine. */
  opensAt: z.string().nullable().default(null),
  /** A check-in asks for a mood when it's marked done; mood is the answer, 1 (worst) to 5 (best). */
  askMood: z.boolean().default(false),
  mood: z.number().int().min(1).max(5).nullable().default(null),
});
export type Occurrence = z.infer<typeof occurrence>;

export const proofPhoto = z.object({ id, occurrenceId: id, uploaderId: id, createdAt: z.string() });
export type ProofPhoto = z.infer<typeof proofPhoto>;

export const reportReason = z.enum(["minor", "non_consensual", "illegal", "other"]);
export const reportInput = z.object({
  subjectId: id,
  photoId: id.optional(),
  reason: reportReason,
  details: z.string().trim().max(1_000).optional(),
});

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

export const mood = z.number().int().min(1).max(5);
export const completeOccurrence = z.object({ noteMd: z.string().max(5_000).optional(), mood: mood.optional() });

/** One point on the mood graph: a check-in, or a journal entry with a mood. */
export const moodEntry = z.object({
  at: z.string(),
  userId: id,
  mood,
  source: z.enum(["checkin", "journal"]),
  /** The check-in task's title, or the journal entry's. */
  title: z.string(),
  note: z.string().nullable(),
  occurrenceId: id.nullable(),
  noteId: id.nullable(),
});
export type MoodEntry = z.infer<typeof moodEntry>;
export const tickStep = z.object({ stepId: z.string().min(1).max(40), done: z.boolean() });
export const reviewOccurrence = z.object({
  approve: z.boolean(),
  noteMd: z.string().max(5_000).optional(),
  /** Posted as a comment on the task, e.g. what to fix when sending it back. */
  comment: z.string().trim().min(1).max(2_000).optional(),
});
export const commentInput = z.object({ body: z.string().trim().min(1).max(2_000) });
export const occurrenceComment = z.object({ id, occurrenceId: id, authorId: id, body: z.string(), createdAt: z.string() });
export type OccurrenceComment = z.infer<typeof occurrenceComment>;

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

/**
 * Sorting out the tasks a plan runs into, each its own way: moved to a new deadline or called off. Moves follow the
 * dynamic's reschedule policy; calling a task off always needs a Dominant, unless one is asking.
 */
export const planRescheduleInput = z.object({
  items: z
    .array(
      z
        .object({ occurrenceId: id, action: z.enum(["move", "cancel"]), dueAt: z.string().datetime({ offset: true }).optional() })
        .refine((i) => i.action === "cancel" || i.dueAt, { message: "a move needs a new deadline" }),
    )
    .min(1)
    .max(200),
  reason: z.string().max(1_000).optional(),
});
export type PlanRescheduleInput = z.input<typeof planRescheduleInput>;

/** A Dominant's answer: approve or decline (the whole group unless `item`), or move this one task to `dueAt` instead. */
export const decideRescheduleInput = z.object({
  approve: z.boolean(),
  dueAt: z.string().datetime({ offset: true }).optional(),
  item: z.boolean().optional(),
});

export const rescheduleRequest = z.object({
  id,
  groupId: id.nullable(),
  occurrenceId: id,
  title: z.string(),
  requestedBy: id,
  scope: z.enum(["this", "following"]),
  /** `cancel` asks to call the occurrence off; approving it excuses the task. */
  kind: z.enum(["move", "cancel"]),
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

/** Hard: never. Soft: only with care, or ask first. Curious: open to trying, carefully. */
export const limitKind = z.enum(["hard", "soft", "curious"]);
export type LimitKind = z.infer<typeof limitKind>;
/** One person's limit. Everyone in the dynamic sees it; only its owner changes it. */
export const limitInput = z.object({
  title: z.string().trim().min(1).max(200),
  kind: limitKind,
  note: z.string().trim().max(2_000).default(""),
});
export const limit = limitInput.extend({ id, relationshipId: id, ownerId: id, createdAt: z.string(), updatedAt: z.string() });
export type Limit = z.infer<typeof limit>;

/** A rule or protocol someone broke, logged by a Dominant or owned up to by the person themselves. */
export const ruleLogInput = z
  .object({
    subjectId: id,
    ruleId: id.nullable().default(null),
    protocolId: id.nullable().default(null),
    note: z.string().trim().max(2_000).default(""),
    occurredOn: plainDate,
    /** A Dominant may hand out a consequence in the same step; it becomes a task like any assigned consequence. */
    consequence: assignConsequence.omit({ assigneeId: true, reason: true }).extend({ consequenceId: id }).optional(),
  })
  .refine((v) => v.ruleId || v.protocolId, "pick the rule or protocol that was broken");
export const ruleLogEntry = z.object({
  id,
  relationshipId: id,
  subjectId: id,
  loggedBy: id,
  ruleId: id.nullable(),
  protocolId: id.nullable(),
  /** What it was called when logged, so the entry still reads right if the rule is renamed or deleted. */
  title: z.string(),
  note: z.string(),
  occurredOn: plainDate,
  /** The consequence task given for it, if any. */
  consequenceTaskId: id.nullable(),
  createdAt: z.string(),
});
export type RuleLogEntry = z.infer<typeof ruleLogEntry>;

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
/** A device this account gets push on. Only the token's end is shown, enough for a client to spot its own. */
export const deviceStatus = z.object({
  platform: z.enum(["android", "web"]),
  tokenTail: z.string(),
  registeredAt: z.string(),
  /** The last push FCM accepted for it; null if none has been sent since it registered. */
  lastSentAt: z.string().nullable(),
  /** Why the last push to it failed, if it did. */
  lastError: z.string().nullable(),
});
export type DeviceStatus = z.infer<typeof deviceStatus>;

export const apiError = z.object({ error: z.string(), details: z.unknown().optional() });

/** Plans either partner puts on the shared calendar. All-day events run from local midnight to the next. */
export const calendarEventInput = z
  .object({
    title: z.string().trim().min(1).max(80),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    allDay: z.boolean().default(false),
    /** Whether the partner is in on it too; only then do the partner's tasks count as clashing. */
    withPartner: z.boolean().default(false),
    noteMd: z.string().max(2_000).nullable().optional(),
  })
  .refine((e) => Date.parse(e.endsAt) > Date.parse(e.startsAt), { message: "an event has to end after it starts", path: ["endsAt"] })
  .refine((e) => Date.parse(e.endsAt) - Date.parse(e.startsAt) <= 31 * 86_400_000, { message: "an event can last a month at most", path: ["endsAt"] });
export const calendarEvent = z.object({
  id,
  relationshipId: id,
  authorId: id,
  title: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  allDay: z.boolean(),
  withPartner: z.boolean(),
  noteMd: z.string().nullable(),
  /** Timed tasks still to do that fall due during the event, for the people it involves. */
  conflictIds: z.array(id),
});
export type CalendarEvent = z.infer<typeof calendarEvent>;

/** A report as the people reviewing them see it. */
export const adminReport = z.object({
  id,
  reason: z.enum(["minor", "non_consensual", "illegal", "other"]),
  details: z.string().nullable(),
  reporter: z.object({ id, displayName: z.string(), email: z.string().nullable() }),
  subject: z.object({ id, displayName: z.string(), email: z.string().nullable() }),
  /** The reported photo while it still exists. */
  photoId: id.nullable(),
  photoDeleted: z.boolean(),
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
});
export type AdminReport = z.infer<typeof adminReport>;
export const resolveReport = z.object({ removePhoto: z.boolean().default(false) });

/** One thing a starter kit can add: a recurring task, a rule, or a protocol (optionally spelling out one of the kit's rules). */
export interface KitItem {
  key: string;
  kind: "task" | "rule" | "protocol";
  title: string;
  bodyMd?: string;
  /** Tasks: how often, and by when. */
  repeat?: { freq: "daily" | "weekly"; interval?: number; byWeekday?: ("MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU")[] };
  dueTime?: string;
  /** Tasks: a check-in that asks for a mood. */
  askMood?: boolean;
  /** Protocols: the key of the kit rule it spells out. */
  ruleKey?: string;
}
export interface StarterKit {
  id: string;
  title: string;
  description: string;
  icon: string;
  items: KitItem[];
}

/** Ready-made sets to start from; a Dominant picks what to add, and everything stays editable afterwards. */
export const starterKits: StarterKit[] = [
  {
    id: "daily-basics",
    title: "Daily basics",
    description: "A simple daily rhythm to start with.",
    icon: "wb_sunny",
    items: [
      {
        key: "morning",
        kind: "task",
        title: "Morning check-in",
        bodyMd: "How you feel, how you slept and your plan for the day.",
        repeat: { freq: "daily" },
        dueTime: "09:00",
        askMood: true,
      },
      { key: "bed", kind: "task", title: "Make the bed", repeat: { freq: "daily" }, dueTime: "10:00" },
      { key: "journal", kind: "task", title: "One line in your journal", bodyMd: "One good thing, one thing to do better.", repeat: { freq: "daily" }, dueTime: "21:30" },
      { key: "lights", kind: "task", title: "Lights out", repeat: { freq: "daily" }, dueTime: "23:00" },
    ],
  },
  {
    id: "health",
    title: "Health and self-care",
    description: "Looking after yourself, on a schedule.",
    icon: "favorite",
    items: [
      { key: "water", kind: "task", title: "Drink 64 oz of water", repeat: { freq: "daily" }, dueTime: "20:00" },
      { key: "vitamins", kind: "task", title: "Take your vitamins", repeat: { freq: "daily" }, dueTime: "09:00" },
      { key: "walk", kind: "task", title: "30-minute walk", repeat: { freq: "daily", interval: 2 }, dueTime: "19:00" },
      { key: "stretch", kind: "task", title: "Stretch for 10 minutes", repeat: { freq: "daily" }, dueTime: "22:00" },
      { key: "skincare", kind: "task", title: "Skincare routine", repeat: { freq: "daily" }, dueTime: "22:30" },
    ],
  },
  {
    id: "home",
    title: "Service and home",
    description: "Keeping the home in order.",
    icon: "home",
    items: [
      { key: "tidy", kind: "task", title: "Tidy the living room", repeat: { freq: "daily" }, dueTime: "19:00" },
      { key: "dishes", kind: "task", title: "Dishes done before bed", repeat: { freq: "daily" }, dueTime: "22:00" },
      { key: "laundry", kind: "task", title: "Laundry", repeat: { freq: "weekly", byWeekday: ["SU"] }, dueTime: "18:00" },
      { key: "outfit", kind: "task", title: "Lay out tomorrow's outfit", repeat: { freq: "daily" }, dueTime: "21:00" },
    ],
  },
  {
    id: "rules",
    title: "Rules to start from",
    description: "A few common rules, with the protocols that spell them out.",
    icon: "gavel",
    items: [
      { key: "honest", kind: "rule", title: "Be honest, always" },
      { key: "ask", kind: "rule", title: "Ask before buying anything over $50" },
      { key: "hydrated", kind: "rule", title: "Stay hydrated" },
      { key: "hydrated-p", kind: "protocol", title: "64 oz of water a day", bodyMd: "Spread through the day; the last glass before 8 pm.", ruleKey: "hydrated" },
      { key: "address", kind: "rule", title: "Address me properly" },
      { key: "address-p", kind: "protocol", title: "How to address me", bodyMd: "Write down the title or name to use, and when.", ruleKey: "address" },
    ],
  },
];

export const applyKit = z.object({
  /** Keys of the kit's items to add; defaults to all of them. */
  items: z.array(z.string()).max(50).optional(),
  /** Who the kit's tasks are for; needed when any task is picked. */
  assigneeId: id.optional(),
  timezone: z.string().min(1).max(64),
  start: plainDate,
});
export const applyKitResult = z.object({ tasks: z.number(), rules: z.number(), protocols: z.number() });
