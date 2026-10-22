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
export const FEATURES = ["points", "consequences", "rules", "protocols", "journal", "stats", "review", "location", "agreement", "scenes", "chastity"] as const;
/** Modules most dynamics won't use: off until a dynamic switches them on. */
const OFF_BY_DEFAULT: readonly (typeof FEATURES)[number][] = ["chastity"];
export const features = z.object(Object.fromEntries(FEATURES.map((f) => [f, z.boolean()])) as Record<(typeof FEATURES)[number], z.ZodBoolean>);
export type Features = z.infer<typeof features>;
export const allFeatures = (stored: Partial<Features> = {}): Features => Object.fromEntries(FEATURES.map((f) => [f, stored[f] ?? !OFF_BY_DEFAULT.includes(f)])) as Features;

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
  /** Notifications may carry a partner's own words (a reminder they wrote, a line sent with "I'm home"). Off by default. */
  notifyDetails: z.boolean().default(false),
});
export type User = z.infer<typeof user>;

/** A date the dynamic marks: an anniversary, a collaring, or anything else it names. */
export const dynamicDate = z.object({ id: z.string().min(1).max(40), label: z.string().trim().min(1).max(40), date: plainDate });
export type DynamicDate = z.infer<typeof dynamicDate>;

/**
 * What a person's Android app last reported about location. `ready`: allowed all the time with location on;
 * `foreground_only`: allowed only while the app is open; `denied`; `services_off`: location is off on the phone.
 */
export const LOCATION_STATUSES = ["ready", "foreground_only", "denied", "services_off"] as const;
export const locationStatus = z.enum(LOCATION_STATUSES);
export type LocationStatus = z.infer<typeof locationStatus>;

export const member = z.object({
  userId: id,
  displayName: z.string(),
  role,
  avatarVersion,
  /** Null when no Android app of theirs has reported yet. */
  locationStatus: locationStatus.nullable().default(null),
  /** Location watching paused by them; until null means until they turn it back on. */
  locationPaused: z.boolean().default(false),
  locationPausedUntil: z.string().nullable().default(null),
  /** Whether their notifications may carry a partner's own words, so a Dominant knows if a reminder in their words gets through. */
  notifyDetails: z.boolean().default(false),
});
/** A Dominant and a submissive trading roles, asked for or under way. Roles in `members` are already swapped while it's active. */
export const roleSwap = z.object({
  id,
  requestedBy: id,
  partnerId: id,
  status: z.enum(["pending", "active"]),
  /** Null: until someone swaps back. */
  endsAt: z.string().nullable(),
  pauseTasks: z.boolean(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
});
export type RoleSwap = z.infer<typeof roleSwap>;
/** At most 30 days out; null means until someone swaps back. */
export const roleSwapInput = z.object({ endsAt: z.string().datetime({ offset: true }).nullable().default(null), pauseTasks: z.boolean().default(true) });

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
  /** Proof photos are deleted this many days after their task is settled; null keeps them. */
  proofDays: z.number().int().nullable().default(null),
  dates: z.array(dynamicDate),
  createdAt: z.string(),
  /** When a partner left or blocked; an ended dynamic is kept read-only for both. */
  endedAt: z.string().nullable(),
  endedBy: id.nullable(),
  /** The open swap, asked for or under way. */
  roleSwap: roleSwap.nullable().default(null),
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
  notifyDetails: z.boolean().optional(),
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
  /** Either partner may change it: the photos are of them, or for them. */
  proofDays: z.number().int().min(1).max(365).nullable().optional(),
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
  /** A journal task: marking it done means writing a journal entry; the details are the prompt. */
  asksJournal: z.boolean().default(false),
  /** A count task (cups of water, edges): marked once each time, done when the count is between these. Either may be open; both null is an ordinary task. */
  countMin: z.number().int().min(1).max(1_000).nullable().default(null),
  countMax: z.number().int().min(1).max(1_000).nullable().default(null),
  /** Points and point penalties once per task, or for each one counted (and each one short or over). */
  countPer: z.enum(["task", "count"]).default("task"),
  /** A location task: done by arriving at this place by the due time. */
  placeId: id.nullable().default(null),
  /** With a place: how long to stay once there; leaving sooner counts as missed ("left early"). */
  stayMinutes: z.number().int().min(5).max(720).nullable().default(null),
  /** The push before it's due: the app's words, the Dominant's own (reminderText, shown when the assignee allows details), or none. */
  reminder: z.enum(["default", "custom", "none"]).default("default"),
  reminderText: z.string().trim().max(140).nullable().default(null),
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
  /** Set when it was marked done offline and reached the server later; completedAt is still when it was done. */
  syncedAt: z.string().nullable().default(null),
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
  /** A journal task: its prompt (the task's details), and the entry written for it once done. */
  asksJournal: z.boolean().default(false),
  journalPrompt: z.string().nullable().default(null),
  journalNoteId: id.nullable().default(null),
  /** A Dominant saw this miss and left it missed, so it no longer needs them. */
  missConfirmed: z.boolean().default(false),
  /** A low check-in (mood 1 or 2) a Dominant has replied to or marked seen. */
  moodSeen: z.boolean().default(false),
  /** In occurrence lists, a miss's consequence still to be done (its title), which a Dominant can drop while keeping the miss. */
  missConsequence: z.string().nullable().default(null),
  /** A count task's bounds (both null for an ordinary task) and how many have been marked. */
  countMin: z.number().int().nullable().default(null),
  countMax: z.number().int().nullable().default(null),
  countPer: z.enum(["task", "count"]).default("task"),
  count: z.number().int().default(0),
  /** A location task's place (see the relationship's places) and stay, when it got there, and when it left before the stay was up. */
  placeId: id.nullable().default(null),
  stayMinutes: z.number().int().nullable().default(null),
  arrivedAt: z.string().nullable().default(null),
  leftAt: z.string().nullable().default(null),
  /** When the assignee may leave the place: the end of their stay once they've arrived, or a curfew's end. */
  stayUntil: z.string().nullable().default(null),
  /** One night of a curfew; these never show as tasks. */
  curfew: z.boolean().default(false),
  /** A consequence handed out, on its own or for a miss; a "let off" reward can get the sub out of it. */
  consequence: z.boolean().default(false),
});
export type Occurrence = z.infer<typeof occurrence>;

/** A spot a Dominant saved for location tasks; arriving anywhere inside the radius counts. */
export const placeInput = z.object({
  name: z.string().trim().min(1).max(40),
  address: z.string().trim().max(200).nullable().default(null),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  /** Phones can't tell much closer than 100 m. */
  radiusM: z.number().int().min(100).max(2_000).default(150),
});
export const place = placeInput.extend({
  id,
  relationshipId: id,
  createdAt: z.string(),
  /** Active tasks that use it. */ taskTitles: z.array(z.string()),
});
export type Place = z.infer<typeof place>;

/** An address or business from place search, nearest the searcher first. */
export const placeSearchResult = z.object({ name: z.string(), address: z.string(), lat: z.number(), lng: z.number() });
export type PlaceSearchResult = z.infer<typeof placeSearchResult>;

/** A phone reporting arrival at a task's place (`enter`), or a browser's one-off "I'm here" (`checkin`). */
export const arriveOccurrence = z.object({
  kind: z.enum(["enter", "checkin"]),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().int().min(0).max(10_000),
  /** When it happened, if it was queued offline; defaults to now. */
  at: z.string().datetime().optional(),
});
export const leaveOccurrence = z.object({ at: z.string().datetime().optional() });
export const reportLocation = z.object({ status: locationStatus });
/** Pauses location watching; until null means until turned back on. */
export const pauseLocation = z.object({ until: z.string().datetime().nullable() });

/**
 * A sub's curfew: home by a set time each night, at the Home place, and in until morning. A time before noon means just
 * after midnight ("12:00 AM" on a Friday is the start of Saturday). With weekendTime, time is for Sun–Thu nights and
 * weekendTime for Fri–Sat nights. Each night is kept, broken and excused like a task.
 */
export const curfewInput = z.object({
  enabled: z.boolean(),
  assigneeId: id,
  placeId: id,
  time: timeOfDay,
  weekendTime: timeOfDay.nullable().default(null),
  until: timeOfDay,
  points: z.number().int().min(0).max(10_000).default(0),
  missPenalty: z.number().int().min(0).max(10_000).default(0),
  consequenceId: id.nullable().default(null),
  timezone: z.string().min(1),
  /** The sub tells the Dominant they're home: getting home puts "Tell … I'm home" in front of them, and location still checks. */
  reportHome: z.boolean().default(false),
});
export type CurfewInput = z.input<typeof curfewInput>;
export type CurfewSettings = z.infer<typeof curfewInput>;

/** The night Today shows a strip for: from an hour before curfew until it ends, or a broken one the Dominant hasn't settled. */
export const curfewNight = z.object({
  occurrenceId: id,
  assigneeId: id,
  placeId: id,
  dueAt: z.string(),
  endsAt: z.string(),
  status: occurrenceStatus,
  arrivedAt: z.string().nullable(),
  leftAt: z.string().nullable(),
  missConfirmed: z.boolean(),
  /** The assignee's phone can't check location, so they say "I'm home" themselves. */
  canTap: z.boolean(),
  /** The latest note a Dominant left about this night (say, with a declined ask). */
  note: z.string().nullable().default(null),
  /** The curfew asks the sub to tell the Dominant they're home; when they did, and the line they sent. */
  reportHome: z.boolean().default(false),
  toldAt: z.string().nullable().default(null),
  toldNote: z.string().nullable().default(null),
});
export type CurfewNight = z.infer<typeof curfewNight>;

/** A plan in the coming week that runs into a curfew night; a Dominant excuses that night or leaves it. */
export const curfewClash = z.object({
  occurrenceId: id,
  dueAt: z.string(),
  endsAt: z.string(),
  eventId: id,
  eventTitle: z.string(),
  eventStartsAt: z.string(),
  eventEndsAt: z.string(),
});
export type CurfewClash = z.infer<typeof curfewClash>;

/** A sub asking for a later curfew one night; pending ones show until that night's curfew, when they lapse. */
export const curfewRequest = z.object({
  id,
  occurrenceId: id,
  /** The plan it was asked from, if any. */
  eventId: id.nullable(),
  eventTitle: z.string().nullable().default(null),
  requestedBy: id,
  fromDueAt: z.string(),
  untilAt: z.string(),
  reason: z.string().nullable(),
  status: z.enum(["pending", "approved", "declined"]),
});
export type CurfewRequest = z.infer<typeof curfewRequest>;
export const curfewRequestInput = z.object({
  occurrenceId: id,
  until: z.string().datetime({ offset: true }),
  reason: z.string().trim().max(280).nullable().optional(),
  eventId: id.nullable().optional(),
});
/** A Dominant approving, optionally at an earlier time than asked. */
export const approveCurfewRequestInput = z.object({ until: z.string().datetime({ offset: true }).nullable().optional() });

/** Whether a plan the person is making runs into one of their curfew nights. */
export const curfewCheckInput = z.object({ startsAt: z.string().datetime({ offset: true }), endsAt: z.string().datetime({ offset: true }) });
export const curfewCheck = z.object({
  night: z.object({ occurrenceId: id, dueAt: z.string(), endsAt: z.string() }).nullable(),
});
export type CurfewCheck = z.infer<typeof curfewCheck>;

export const curfew = z.object({
  settings: curfewInput.nullable(),
  night: curfewNight.nullable(),
  clashes: z.array(curfewClash),
  /** Pending asks for more time: a sub sees their own, a Dominant all of them. */
  requests: z.array(curfewRequest).default([]),
});
export type Curfew = z.infer<typeof curfew>;
export const excuseCurfewInput = z.object({ occurrenceId: id });
/** "Tell Sam I'm home", with an optional line. */
export const tellHomeInput = z.object({ note: z.string().trim().max(280).nullable().optional() });

/** Adds to a count task's count (a tap is by: 1), or sets it outright to fix a mistake. */
export const countOccurrence = z.union([z.object({ by: z.number().int().min(-1_000).max(1_000) }), z.object({ to: z.number().int().min(0).max(10_000) })]);

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
export const completeOccurrence = z.object({
  noteMd: z.string().max(5_000).optional(),
  mood: mood.optional(),
  /** A journal task's entry; it's saved to the journal, shared with the dynamic. */
  journal: z.object({ title: z.string().max(200).default(""), bodyMd: z.string().trim().min(1).max(100_000) }).optional(),
  /** When it was done, for a completion queued offline; the server takes it if it's within the last day. */
  doneAt: z.string().datetime().optional(),
});

/** Done, missed and excused counts; `rate` is done / (done + missed), null when nothing was due. */
export const tally = z.object({ done: z.number().int(), missed: z.number().int(), excused: z.number().int(), rate: z.number().nullable() });
export type Tally = z.infer<typeof tally>;

/** A calendar month, "2026-10". */
export const monthKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "expected YYYY-MM");

/** How one person's tasks went over a stretch of days, for the Stats page. */
export const dynamicStats = z.object({
  days: z.number().int(),
  /** Set when the stretch is a calendar month (the whole month, matching the monthly review); `previous` is then the month before. */
  month: monthKey.nullable(),
  totals: tally.extend({
    /** Done by the deadline it had when it was done. */
    onTime: z.number().int(),
    /** Occurrences whose deadline was moved. */
    moved: z.number().int(),
  }),
  /** The same counts for the stretch just before, for the trend. */
  previous: tally,
  /** Oldest first: days for a week or month, weeks for 3 months, months for a year. `start` is a local date. */
  buckets: z.array(tally.extend({ start: plainDate })),
  bucket: z.enum(["day", "week", "month"]),
  /** Index 0 is Sunday. */
  weekdays: z.array(tally).length(7),
  tasks: z.array(tally.extend({ taskId: id, title: z.string(), streak: z.number().int(), active: z.boolean() })),
});
export type DynamicStats = z.infer<typeof dynamicStats>;
export const STATS_RANGES = [7, 30, 90, 365] as const;

export const monthFocusInput = z.object({ goal: z.string().trim().min(1).max(200), taskIds: z.array(id).max(10).default([]) });
export const monthReviewInput = z.object({
  rating: z.number().int().min(1).max(5),
  wentWell: z.string().trim().max(2_000).default(""),
  workOn: z.string().trim().max(2_000).default(""),
});
export const monthFocus = z.object({ goal: z.string(), taskIds: z.array(id), setBy: id.nullable(), updatedAt: z.string() });
export type MonthFocus = z.infer<typeof monthFocus>;
export const monthReview = z.object({ userId: id, rating: z.number().int(), wentWell: z.string(), workOn: z.string(), updatedAt: z.string() });
export type MonthReview = z.infer<typeof monthReview>;
/** A month in the dynamic: its focus, how the sub's tasks went against the month before, and the reviews. */
export const monthSummary = z.object({
  month: monthKey,
  /** Whose tasks the numbers are about: the dynamic's first sub, or null when there isn't one. */
  subjectId: id.nullable(),
  focus: monthFocus.nullable(),
  /** The review opens for the month's last three days and stays open after. */
  reviewOpensOn: plainDate,
  reviewOpen: z.boolean(),
  /** Your own answers, and everyone else's once you've given yours. */
  reviews: z.array(monthReview),
  /** People who haven't answered yet. */
  waitingOn: z.array(id),
  totals: tally,
  previous: tally,
  /** The focus tasks' counts this month, in the order they were picked. */
  focusTasks: z.array(tally.extend({ taskId: id, title: z.string() })),
  /** Average mood (1 to 5) from the sub's check-ins and journal this month; null without any. Kept for older apps. */
  mood: z.number().nullable(),
  /** Each mood the sub gave this month, oldest first: the month's mood line. Never compared with another month. */
  moods: z.array(z.object({ at: z.string(), mood })).default([]),
});
export type MonthSummary = z.infer<typeof monthSummary>;
export const pastMonth = z.object({ month: monthKey, goal: z.string().nullable(), myRating: z.number().int().nullable(), rate: z.number().nullable() });
export type PastMonth = z.infer<typeof pastMonth>;

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
export const noteComment = z.object({ id, noteId: id, authorId: id, body: z.string(), createdAt: z.string() });
export type NoteComment = z.infer<typeof noteComment>;

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

/** A sub's delay from the weekly allowance, which applied without asking; a Dominant's Today shows it until they close it. */
export const delayUsed = z.object({
  /** The request to mark seen; it closes the rest of its group too. */
  id,
  requestedBy: id,
  items: z.array(z.object({ occurrenceId: id, title: z.string(), fromDueAt: z.string(), toDueAt: z.string() })),
  reason: z.string().nullable(),
  createdAt: z.string(),
  /** Delays left in the allowance for the rest of the week, and the allowance itself. */
  left: z.number().int(),
  allowance: z.number().int(),
});
export type DelayUsed = z.infer<typeof delayUsed>;

export const ledgerEntry = z.object({
  id,
  userId: id,
  delta: z.number().int(),
  kind: z.enum(["completion", "miss", "redemption", "adjustment", "delay"]),
  note: z.string(),
  createdBy: id.nullable(),
  createdAt: z.string(),
  /** A redemption: the reward, and when a Dominant marked it redeemed (null while it waits on them) with their note. */
  rewardId: id.nullable().default(null),
  /** A "let off" redemption's consequence (its occurrence, and title). */
  occurrenceId: id.nullable().default(null),
  consequenceTitle: z.string().nullable().default(null),
  redeemedAt: z.string().nullable().default(null),
  redeemedBy: id.nullable().default(null),
  redeemNote: z.string().nullable().default(null),
});
export type LedgerEntry = z.infer<typeof ledgerEntry>;

/** A Dominant marking a redemption redeemed, with an optional note to the sub. */
export const markRedeemedInput = z.object({ note: z.string().trim().max(500).nullable().optional() });
export const adjustPoints = z.object({ userId: id, delta: z.number().int(), note: z.string().min(1).max(500) });

/** Lock time a consequence adds or a reward takes off: from 15 minutes to 30 days. */
const lockMinutes = z
  .number()
  .int()
  .min(15)
  .max(30 * 24 * 60);

export const rewardInput = z.object({
  title: z.string().min(1).max(200),
  bodyMd: z.string().max(5_000).default(""),
  cost: z.number().int().min(0),
  /** Unused: redeeming never waits for approval; a Dominant marks it redeemed afterwards instead. */
  needsApproval: z.boolean().default(true),
  /** Gets the sub out of a consequence: redeeming it names one of theirs, excused once the Dominant marks it redeemed. */
  letsOff: z.boolean().default(false),
  /** Takes this many minutes off their chastity lock once the Dominant marks it redeemed. */
  lockMinutes: lockMinutes.nullable().default(null),
});
/** Redeeming a reward; one that lets them off a consequence names it (a consequence task's occurrence). */
export const redeemInput = z.object({ consequenceOccurrenceId: id.nullable().optional() });
export const reward = rewardInput.extend({ id, relationshipId: id, createdAt: z.string() });

export const consequenceInput = z.object({
  title: z.string().min(1).max(200),
  bodyMd: z.string().max(5_000).default(""),
  severity: z.number().int().min(1).max(5).default(1),
  /** Adds this many minutes to their chastity lock instead of becoming a task; nothing happens when they aren't locked. */
  lockMinutes: lockMinutes.nullable().default(null),
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

/** Yellow: slow down and check in. Red: stop; while it's on, tasks that slip are excused instead of missed. */
export const SAFE_LEVELS = ["yellow", "red"] as const;
export const safeCallInput = z.object({ level: z.enum(SAFE_LEVELS), note: z.string().trim().max(500).default("") });
export const safeCall = z.object({
  id,
  relationshipId: id,
  callerId: id,
  level: z.enum(SAFE_LEVELS),
  note: z.string(),
  createdAt: z.string(),
  clearedAt: z.string().nullable(),
  clearedBy: id.nullable(),
});
export type SafeCall = z.infer<typeof safeCall>;
/** The dynamic's open safe call, if any, and the most recent ones. */
export const safeCalls = z.object({ active: safeCall.nullable(), recent: z.array(safeCall) });
export type SafeCalls = z.infer<typeof safeCalls>;

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
  commentCount: z.number().int().default(0),
  /** Earlier versions kept of the title and text; more than 0 means it was edited. */
  revisionCount: z.number().int().default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Note = z.infer<typeof note>;
/** A note's title and text before an edit; [createdAt] is when that edit replaced it. */
export const noteRevision = z.object({ id, noteId: id, editorId: id, title: z.string(), bodyMd: z.string(), createdAt: z.string() });
export type NoteRevision = z.infer<typeof noteRevision>;

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
  /** Set when someone other than the author changed it (a Dominant moving its end). */
  changedBy: id.nullable().default(null),
  previousEndsAt: z.string().nullable().default(null),
  changeNote: z.string().nullable().default(null),
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

const kitKey = z.string().min(1).max(40);
/**
 * One thing a kit can add. Starter kits use tasks, rules and protocols; a kit someone saves from their own dynamic
 * can also carry rewards and consequences, and a task's own settings. Never who a task is for, places, photos or history.
 */
export const kitItem = z.object({
  key: kitKey,
  kind: z.enum(["task", "rule", "protocol", "reward", "consequence"]),
  title: z.string().min(1).max(200),
  bodyMd: z.string().max(20_000).optional(),
  /** Tasks: how often (absent for a one-off, which lands on the day the kit is added), and by when. */
  repeat: recurrenceRule.omit({ count: true, until: true }).optional(),
  anchor: z.enum(["calendar", "completion"]).optional(),
  dueTime: timeOfDay.optional(),
  /** Tasks: a check-in that asks for a mood. */
  askMood: z.boolean().optional(),
  /** Tasks: done by writing a journal entry; bodyMd is the prompt. */
  asksJournal: z.boolean().optional(),
  points: z.number().int().min(-10_000).max(10_000).optional(),
  missPenalty: z.number().int().min(0).max(10_000).optional(),
  proofRequired: z.boolean().optional(),
  approvalRequired: z.boolean().optional(),
  graceMinutes: z
    .number()
    .int()
    .min(0)
    .max(60 * 24 * 7)
    .optional(),
  /** Tasks: a ritual's steps, in order. */
  steps: z.array(z.string().min(1).max(200)).max(30).optional(),
  windowMinutes: z
    .number()
    .int()
    .min(5)
    .max(60 * 24)
    .optional(),
  countMin: z.number().int().min(1).max(1_000).optional(),
  countMax: z.number().int().min(1).max(1_000).optional(),
  countPer: z.enum(["task", "count"]).optional(),
  reminder: z.enum(["default", "custom", "none"]).optional(),
  reminderText: z.string().max(200).optional(),
  /** Tasks: the kit's consequence handed out on a miss, and when it's due. */
  consequenceKey: kitKey.optional(),
  consequenceDueDays: z.number().int().min(0).max(30).optional(),
  consequenceDueTime: timeOfDay.optional(),
  /** Tasks: the kit's reward it earns. */
  rewardKey: kitKey.optional(),
  /** Protocols: the key of the kit rule it spells out. */
  ruleKey: kitKey.optional(),
  /** Rules: their heading. */
  category: z.string().max(60).optional(),
  /** Rewards. */
  cost: z.number().int().min(0).max(1_000_000).optional(),
  needsApproval: z.boolean().optional(),
  letsOff: z.boolean().optional(),
  /** Consequences. */
  severity: z.number().int().min(1).max(5).optional(),
});
export type KitItem = z.infer<typeof kitItem>;
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
      {
        key: "journal",
        kind: "task",
        title: "One line in your journal",
        bodyMd: "One good thing, one thing to do better.",
        repeat: { freq: "daily" },
        dueTime: "21:30",
        asksJournal: true,
      },
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
export const applyKitResult = z.object({ tasks: z.number(), rules: z.number(), protocols: z.number(), rewards: z.number(), consequences: z.number() });
export type ApplyKitResult = z.infer<typeof applyKitResult>;

/** A kit someone saved: theirs alone, usable in any dynamic they manage, and shareable by a code. */
export const kit = z.object({
  id,
  title: z.string(),
  description: z.string(),
  items: z.array(kitItem),
  /** Set while it's shared: anyone with the code can see it and save a copy. */
  shareCode: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Kit = z.infer<typeof kit>;
const kitTitle = z.string().trim().min(1).max(60);
const kitDescription = z.string().trim().max(200);
/** Save a kit from what a dynamic already has; a task brings its reward and consequence along. */
export const kitInput = z.object({
  title: kitTitle,
  description: kitDescription.default(""),
  tasks: z.array(id).max(50).default([]),
  rules: z.array(id).max(50).default([]),
  protocols: z.array(id).max(50).default([]),
  rewards: z.array(id).max(50).default([]),
  consequences: z.array(id).max(50).default([]),
});
/** Rename a kit, or keep only some of its items (by key). */
export const kitPatch = z.object({ title: kitTitle.optional(), description: kitDescription.optional(), keep: z.array(kitKey).max(200).optional() });
/** A shared kit as anyone with its code sees it: no owner, no dates. */
export const sharedKit = z.object({ code: z.string(), title: z.string(), description: z.string(), items: z.array(kitItem) });
export type SharedKit = z.infer<typeof sharedKit>;
/** Share codes: six letters and digits, without look-alikes; typed with or without the dash, any case. */
export const SHARE_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const normalizeShareCode = (input: string) => {
  const m = /(?:\/kit\/)?([A-Za-z0-9-]{6,7})\s*$/.exec(input.trim());
  const code = m ? m[1]!.replace("-", "").toUpperCase() : "";
  return code.length === 6 && [...code].every((c) => SHARE_CODE_ALPHABET.includes(c)) ? code : null;
};

/**
 * The agreement: one versioned page both partners sign. Text sections are plain lines ("- " starts a bullet);
 * a rules or protocols section lists that page's titles as they stood when the version was proposed.
 */
export const AGREEMENT_SECTION_KINDS = ["text", "rules", "protocols"] as const;
export const agreementSectionInput = z.object({
  id: z.string().min(1).max(40),
  kind: z.enum(AGREEMENT_SECTION_KINDS).default("text"),
  title: z.string().trim().min(1).max(80),
  body: z.string().max(5000).default(""),
  /** A note the section points to, such as Limits. */
  noteId: id.nullable().default(null),
});
export type AgreementSectionInput = z.infer<typeof agreementSectionInput>;
/** Proposing a version: the whole page, a review date, and a line for the partner about what changed. */
export const agreementInput = z.object({
  sections: z.array(agreementSectionInput).min(1).max(30),
  reviewBy: plainDate.nullable().default(null),
  note: z.string().trim().max(500).default(""),
});
export type AgreementInput = z.infer<typeof agreementInput>;
export const agreementFeedbackInput = z.object({ note: z.string().trim().min(1).max(1000) });
/** A line of a section against the version in force before it: unchanged, added or removed. */
export const agreementLine = z.object({ op: z.enum(["same", "add", "del"]), text: z.string() });
export type AgreementLine = z.infer<typeof agreementLine>;
export const agreementSection = z.object({
  id: z.string(),
  kind: z.enum(AGREEMENT_SECTION_KINDS),
  title: z.string(),
  body: z.string(),
  noteId: id.nullable(),
  /** The linked note's title, or null when there's none or it was deleted. */
  noteTitle: z.string().nullable(),
  /** Rule or protocol titles, for those kinds. */
  items: z.array(z.string()),
  /** Against the version before: new section, changed, or the same. */
  change: z.enum(["new", "changed", "same"]),
  /** Body lines (or items) with what was added and removed. */
  lines: z.array(agreementLine),
});
export type AgreementSection = z.infer<typeof agreementSection>;
export const AGREEMENT_STATUSES = ["proposed", "changes_requested", "agreed", "superseded"] as const;
export const agreementVersion = z.object({
  id,
  relationshipId: id,
  number: z.number().int(),
  status: z.enum(AGREEMENT_STATUSES),
  sections: z.array(agreementSection),
  /** Titles of sections the version before had and this one drops. */
  removed: z.array(z.string()),
  /** How many sections are new or changed, plus removed ones. */
  changes: z.number().int(),
  reviewBy: plainDate.nullable(),
  note: z.string(),
  proposedBy: id.nullable(),
  proposedAt: z.string(),
  /** Who has agreed to this version, and when. */
  agreements: z.array(z.object({ userId: id, agreedAt: z.string() })),
  agreedAt: z.string().nullable(),
  /** The latest "ask for changes". */
  feedback: z.object({ userId: id.nullable(), note: z.string(), at: z.string() }).nullable(),
});
export type AgreementVersion = z.infer<typeof agreementVersion>;
export const agreementVersionSummary = agreementVersion.pick({ id: true, number: true, status: true, proposedBy: true, proposedAt: true, agreedAt: true, changes: true });
export type AgreementVersionSummary = z.infer<typeof agreementVersionSummary>;
/** The version in force, the open proposal if there is one, and every version newest first. */
export const agreement = z.object({ current: agreementVersion.nullable(), proposal: agreementVersion.nullable(), versions: z.array(agreementVersionSummary) });
export type Agreement = z.infer<typeof agreement>;

/** A rule or protocol someone else added, changed or removed, not yet marked seen. */
export const libraryChange = z.object({
  id,
  kind: z.enum(["rules", "protocols"]),
  verb: z.enum(["added", "changed", "removed"]),
  itemId: id,
  title: z.string(),
  changedBy: id.nullable(),
  createdAt: z.string(),
});
export type LibraryChange = z.infer<typeof libraryChange>;
export const seenLibraryChangesInput = z.object({ ids: z.array(id).max(200) });

/** Aftercare offered when logging a scene or writing a plan; anything else can be typed in. */
export const AFTERCARE = ["Water", "Blanket", "Cuddles", "Snack", "Quiet time", "Talking it through"] as const;
const aftercareList = z.array(z.string().trim().min(1).max(60)).max(20);

/** A scene as logged: either partner logs it, and it can be changed by anyone in the dynamic. */
export const sceneInput = z.object({
  title: z.string().trim().max(120).default(""),
  occurredAt: z.string().datetime({ offset: true }),
  /** Where it happened, for the next-day check-in. */
  timezone: z.string().min(1).max(64),
  what: z.string().trim().max(4_000).default(""),
  safeword: z.enum(["none", "yellow", "red"]).default("none"),
  aftercare: aftercareList.default([]),
});
export type SceneInput = z.infer<typeof sceneInput>;

/** One person's side, written alone and shared once. */
export const sceneSideInput = z.object({
  mood,
  worked: z.string().trim().max(2_000).default(""),
  change: z.string().trim().max(2_000).default(""),
  need: z.string().trim().max(2_000).default(""),
});
export const sceneSide = sceneSideInput.extend({ userId: id, sharedAt: z.string() });
export type SceneSide = z.infer<typeof sceneSide>;

/** "How are you feeling after last night?", the day after. */
export const sceneCheckInput = z.object({ mood, note: z.string().trim().max(500).default("") });
export const sceneCheck = sceneCheckInput.extend({ userId: id, at: z.string() });
export type SceneCheck = z.infer<typeof sceneCheck>;

export const scene = z.object({
  id,
  title: z.string(),
  occurredAt: z.string(),
  timezone: z.string(),
  what: z.string(),
  safeword: z.enum(["none", "yellow", "red"]),
  aftercare: z.array(z.string()),
  loggedBy: id.nullable(),
  createdAt: z.string(),
  /** When the next-day check-in opens (10:00 the day after, where it happened). */
  checkFrom: z.string(),
  /** Everyone who has shared their side. */
  shared: z.array(id),
  /** My side, and the others' once I've shared mine. */
  sides: z.array(sceneSide),
  checks: z.array(sceneCheck),
  /** Whether I've closed the other person's aftercare plan on Today. */
  aftercareDone: z.boolean(),
  commentCount: z.number().int(),
});
export type Scene = z.infer<typeof scene>;

/** What someone needs after a scene; only they edit it. */
export const aftercarePlanInput = z.object({ needs: aftercareList, note: z.string().trim().max(1_000).default("") });
export const aftercarePlan = aftercarePlanInput.extend({ userId: id, updatedAt: z.string().nullable() });
export type AftercarePlan = z.infer<typeof aftercarePlan>;

export const sceneComment = z.object({ id, sceneId: id, authorId: id, body: z.string(), createdAt: z.string() });
export type SceneComment = z.infer<typeof sceneComment>;

/**
 * Chastity, an optional module. A Dominant (the keyholder) asks; the lock starts once the wearer locks up, sealing a
 * photo of the keybox code they set without looking when there's a keybox. Timed or open-ended; the keyholder can
 * hide the time left.
 */
export const chastityKeyMode = z.enum(["keyholder", "keybox"]);
export const chastityLockInput = z.object({
  wearerId: id.optional(),
  /** Null: until the keyholder releases them. */
  minutes: z
    .number()
    .int()
    .min(15)
    .max(90 * 24 * 60)
    .nullable()
    .default(null),
  hideTime: z.boolean().default(false),
  keyMode: chastityKeyMode.default("keyholder"),
});
export const chastityLock = z.object({
  id,
  relationshipId: id,
  wearerId: id,
  keyholderId: id,
  /** "break": out for an approved hygiene break, until they relock. */
  status: z.enum(["pending", "active", "break", "ended", "declined", "cancelled"]),
  keyMode: chastityKeyMode,
  /** How long it was asked for; null when open-ended. */
  minutes: z.number().int().nullable(),
  hideTime: z.boolean(),
  startedAt: z.string().nullable(),
  /** Null when open-ended, and for a wearer whose keyholder hides the time. */
  endsAt: z.string().nullable(),
  /** Whether there's an end the viewer isn't shown. */
  timeHidden: z.boolean(),
  breakEndsAt: z.string().nullable(),
  /** Whether a keybox photo is sealed, and whether this viewer may see it now. */
  hasKeybox: z.boolean(),
  canSeeKeybox: z.boolean(),
  createdAt: z.string(),
  endedAt: z.string().nullable(),
  endReason: z.enum(["time", "released"]).nullable(),
});
export type ChastityLock = z.infer<typeof chastityLock>;
export const chastityEvent = z.object({
  id,
  lockId: id,
  kind: z.enum(["started", "time", "release_ask", "break", "photo_ask", "relocked", "ended"]),
  /** For asks: pending until decided. A break goes "overdue" when they haven't relocked in time. */
  status: z.enum(["pending", "approved", "declined", "done", "overdue"]).nullable(),
  /** Time added (negative: taken off), or a break's length. */
  minutes: z.number().int().nullable(),
  note: z.string().nullable(),
  byId: id.nullable(),
  createdAt: z.string(),
  decidedAt: z.string().nullable(),
  /** A photo ask's task. */
  taskId: id.nullable(),
});
export type ChastityEvent = z.infer<typeof chastityEvent>;
export const chastityView = z.object({
  /** Locks waiting to start or running, newest first. */
  open: z.array(chastityLock),
  /** Everything that happened during the open locks, newest first. */
  events: z.array(chastityEvent),
  past: z.array(chastityLock),
});
export type ChastityView = z.infer<typeof chastityView>;
export const chastityTimeInput = z.object({
  minutes: z
    .number()
    .int()
    .min(-90 * 24 * 60)
    .max(90 * 24 * 60)
    .refine((n) => n !== 0, "add or take off some time"),
  note: z.string().trim().max(500).optional(),
});
const breakMinutes = z.number().int().min(5).max(180);
export const chastityAskInput = z.object({ kind: z.enum(["release", "break"]), minutes: breakMinutes.optional(), note: z.string().trim().max(500).optional() });
export const chastityDecideInput = z.object({ approve: z.boolean(), minutes: breakMinutes.optional(), note: z.string().trim().max(500).optional() });
/** Asking the wearer for a photo: a task with photo proof, due when the keyholder says. */
export const chastityPhotoAskInput = z.object({ dueAt: z.string().datetime({ offset: true }), timezone: z.string().min(1) });
