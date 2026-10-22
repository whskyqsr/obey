import { sql } from "drizzle-orm";
import { boolean, customType, date, doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import type { AgreementSectionInput, CurfewSettings, DynamicDate, Features, KitItem } from "@obey/contracts";
import type { Schedule } from "@obey/recurrence";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();
const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  authUid: text("auth_uid").notNull().unique(),
  displayName: text("display_name").notNull(),
  email: text("email"),
  /** A small square JPEG/PNG/WebP the client resized; null until someone uploads one. */
  avatar: bytea("avatar"),
  avatarType: text("avatar_type"),
  avatarUpdatedAt: ts("avatar_updated_at"),
  /** "sun" or "mon": where calendars start the week. */
  weekStart: text("week_start").notNull().default("sun"),
  /** When they confirmed they're 18+ and accepted the rules for proof photos; uploads wait for this. */
  proofTermsAcceptedAt: ts("proof_terms_accepted_at"),
  /** Proof photos show blurred until tapped unless this is on (it takes a switch and a confirmation). */
  revealProofs: boolean("reveal_proofs").notNull().default(false),
  /** Quiet hours as "HH:mm" in [timezone]; pushes then arrive silently. All null when off. */
  quietStart: text("quiet_start"),
  quietEnd: text("quiet_end"),
  timezone: text("timezone"),
  /** Notification categories turned off (see notifyCategory). */
  mutedNotifications: jsonb("muted_notifications").$type<string[]>().notNull().default([]),
  /** Let pushes carry a partner's own words (a reminder they wrote, a line sent with "I'm home"); off keeps them to who did what. */
  notifyDetails: boolean("notify_details").notNull().default(false),
  /** What their Android app last said about location: whether arrivals can be noticed while it's closed. Null: never reported. */
  locationStatus: text("location_status", { enum: ["ready", "foreground_only", "denied", "services_off"] }),
  locationStatusAt: ts("location_status_at"),
  createdAt: createdAt(),
});

export const relationships = pgTable("relationships", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Optional; apps show the partners' names when it's null. */
  name: text("name"),
  reschedulePolicy: text("reschedule_policy", { enum: ["dominant_only", "request", "allowance"] })
    .notNull()
    .default("request"),
  weeklyDelayAllowance: integer("weekly_delay_allowance").notNull().default(0),
  /** Switched-off parts of the app for this dynamic; missing keys mean on. */
  features: jsonb("features").$type<Partial<Features>>().notNull().default({}),
  /** Whether a submissive may write notes of their own. */
  subNotes: boolean("sub_notes").notNull().default(true),
  /** Proof photos are deleted this many days after their task is settled; null keeps them. */
  proofDays: integer("proof_days"),
  /** Anniversaries and other dates the dynamic marks. */
  dates: jsonb("dates").$type<DynamicDate[]>().notNull().default([]),
  /** The sub's curfew as a Dominant set it; its nights are hidden task series (see task_series.curfew_until). */
  curfew: jsonb("curfew").$type<CurfewSettings>(),
  createdAt: createdAt(),
  /** Set when a partner leaves or blocks: the dynamic stays readable for both, and nothing in it can change. */
  endedAt: ts("ended_at"),
  endedBy: uuid("ended_by").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
});

export const memberships = pgTable(
  "memberships",
  {
    relationshipId: uuid("relationship_id")
      .notNull()
      .references(() => relationships.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["dominant", "submissive", "switch"] }).notNull(),
    /** Location watching paused by this member: from, and until (null until they turn it back on). */
    locationPausedAt: ts("location_paused_at"),
    locationPausedUntil: ts("location_paused_until"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.relationshipId, t.userId] }), index("memberships_user_idx").on(t.userId)],
);

export const invites = pgTable("invites", {
  code: text("code").primaryKey(),
  relationshipId: uuid("relationship_id")
    .notNull()
    .references(() => relationships.id, { onDelete: "cascade" }),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  expiresAt: ts("expires_at").notNull(),
  usedBy: uuid("used_by").references(() => users.id),
  /** What the person joining becomes; null lets them choose. */
  role: text("role", { enum: ["dominant", "submissive", "switch"] }),
  createdAt: createdAt(),
});

export const rewards = pgTable("rewards", {
  id: uuid("id").primaryKey().defaultRandom(),
  relationshipId: uuid("relationship_id")
    .notNull()
    .references(() => relationships.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  bodyMd: text("body_md").notNull().default(""),
  cost: integer("cost").notNull(),
  needsApproval: boolean("needs_approval").notNull().default(true),
  /** Gets the sub out of a consequence of their choosing, once a Dominant marks the redemption redeemed. */
  letsOff: boolean("lets_off").notNull().default(false),
  /** Minutes it takes off their chastity lock once marked redeemed. */
  lockMinutes: integer("lock_minutes"),
  createdAt: createdAt(),
});

export const consequences = pgTable("consequences", {
  id: uuid("id").primaryKey().defaultRandom(),
  relationshipId: uuid("relationship_id")
    .notNull()
    .references(() => relationships.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  bodyMd: text("body_md").notNull().default(""),
  severity: integer("severity").notNull().default(1),
  /** Adds this many minutes to their chastity lock instead of becoming a task. */
  lockMinutes: integer("lock_minutes"),
  createdAt: createdAt(),
});

export const rules = pgTable("rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  relationshipId: uuid("relationship_id")
    .notNull()
    .references(() => relationships.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  bodyMd: text("body_md").notNull().default(""),
  category: text("category"),
  position: integer("position").notNull().default(0),
  createdAt: createdAt(),
});

export const protocols = pgTable("protocols", {
  id: uuid("id").primaryKey().defaultRandom(),
  relationshipId: uuid("relationship_id")
    .notNull()
    .references(() => relationships.id, { onDelete: "cascade" }),
  /** The rule it spells out; deleting the rule keeps the protocol. */
  ruleId: uuid("rule_id").references(() => rules.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  bodyMd: text("body_md").notNull().default(""),
  position: integer("position").notNull().default(0),
  createdAt: createdAt(),
});

/** Each person's hard and soft limits and things they're curious about; only the owner changes them. */
export const limits = pgTable(
  "limits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    relationshipId: uuid("relationship_id")
      .notNull()
      .references(() => relationships.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    kind: text("kind", { enum: ["hard", "soft", "curious"] }).notNull(),
    note: text("note").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("limits_relationship_idx").on(t.relationshipId)],
);

/** Broken rules and protocols, newest first; the title is a snapshot so entries outlive renames and deletions. */
export const ruleLog = pgTable(
  "rule_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    relationshipId: uuid("relationship_id")
      .notNull()
      .references(() => relationships.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    loggedBy: uuid("logged_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ruleId: uuid("rule_id").references(() => rules.id, { onDelete: "set null" }),
    protocolId: uuid("protocol_id").references(() => protocols.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    note: text("note").notNull().default(""),
    occurredOn: date("occurred_on", { mode: "string" }).notNull(),
    consequenceTaskId: uuid("consequence_task_id").references((): AnyPgColumn => taskSeries.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("rule_log_relationship_idx").on(t.relationshipId, t.occurredOn)],
);

export const taskSeries = pgTable(
  "task_series",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    relationshipId: uuid("relationship_id")
      .notNull()
      .references(() => relationships.id, { onDelete: "cascade" }),
    assigneeId: uuid("assignee_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    bodyMd: text("body_md").notNull().default(""),
    points: integer("points").notNull().default(0),
    missPenalty: integer("miss_penalty").notNull().default(0),
    rewardId: uuid("reward_id").references(() => rewards.id, { onDelete: "set null" }),
    consequenceId: uuid("consequence_id").references(() => consequences.id, { onDelete: "set null" }),
    consequenceDueDays: integer("consequence_due_days").notNull().default(1),
    consequenceDueTime: text("consequence_due_time"),
    /** Set when this one-off task is a consequence handed out on its own. */
    assignedConsequenceId: uuid("assigned_consequence_id").references(() => consequences.id, { onDelete: "set null" }),
    proofRequired: boolean("proof_required").notNull().default(false),
    approvalRequired: boolean("approval_required").notNull().default(false),
    schedule: jsonb("schedule").$type<Schedule>().notNull(),
    dueTime: text("due_time"),
    timezone: text("timezone").notNull(),
    graceMinutes: integer("grace_minutes").notNull().default(0),
    /** A ritual's ordered steps; a task with none is an ordinary one. */
    steps: jsonb("steps").$type<{ id: string; title: string }[]>().notNull().default([]),
    /** When set, the assignee can only do it in the last this-many minutes before it's due. */
    windowMinutes: integer("window_minutes"),
    /** A check-in: completing it asks the assignee how they feel (1 to 5). */
    askMood: boolean("ask_mood").notNull().default(false),
    /** A journal task: completing it means writing a journal entry, prompted by the task's details. */
    asksJournal: boolean("asks_journal").notNull().default(false),
    /** A count task is marked once per time it's done; it's done when the count is between these (either may be open). */
    countMin: integer("count_min"),
    countMax: integer("count_max"),
    /** Whether points and point penalties are booked once ("task") or for each one counted, or short or over ("count"). */
    countPer: text("count_per", { enum: ["task", "count"] })
      .notNull()
      .default("task"),
    /** A location task: done by arriving at this place by the deadline. */
    placeId: uuid("place_id").references((): AnyPgColumn => places.id, { onDelete: "set null" }),
    /** With a place: how long to stay once there; leaving sooner is a miss ("left early"). */
    stayMinutes: integer("stay_minutes"),
    /** Set on a curfew's hidden series: due is the curfew, and the assignee stays at the place until this local time. */
    curfewUntil: text("curfew_until"),
    /** The push before it's due: the app's own words, the Dominant's (reminderText), or none at all. */
    reminder: text("reminder", { enum: ["default", "custom", "none"] })
      .notNull()
      .default("default"),
    reminderText: text("reminder_text"),
    active: boolean("active").notNull().default(true),
    /** Set on the consequence handed out automatically for this missed occurrence; unique, so it's issued once. */
    causedByOccurrenceId: uuid("caused_by_occurrence_id").references((): AnyPgColumn => occurrences.id, { onDelete: "set null" }),
    /** Set when "this and following" rescheduling splits the series. */
    supersededBy: uuid("superseded_by"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("task_series_relationship_idx").on(t.relationshipId), uniqueIndex("task_series_caused_by_uq").on(t.causedByOccurrenceId)],
);

export const occurrences = pgTable(
  "occurrences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seriesId: uuid("series_id")
      .notNull()
      .references(() => taskSeries.id, { onDelete: "cascade" }),
    /** Identity within the series, like iCalendar's RECURRENCE-ID. Never changes. */
    originalDate: date("original_date", { mode: "string" }).notNull(),
    dueAt: ts("due_at").notNull(),
    originalDueAt: ts("original_due_at").notNull(),
    status: text("status", { enum: ["pending", "submitted", "completed", "missed", "excused", "cancelled"] })
      .notNull()
      .default("pending"),
    completedAt: ts("completed_at"),
    /** When a completion made offline reached the server; null when it was marked done live. */
    syncedAt: ts("synced_at"),
    reminderSentAt: ts("reminder_sent_at"),
    noteMd: text("note_md"),
    /** Kept in step with proof_photos, so lists can show a count without a join. */
    photoCount: integer("photo_count").notNull().default(0),
    commentCount: integer("comment_count").notNull().default(0),
    /** Ids of the ritual steps ticked off so far. */
    stepsDone: jsonb("steps_done").$type<string[]>().notNull().default([]),
    /** How many times a count task has been marked so far. */
    count: integer("count").notNull().default(0),
    /** A location task: when the assignee got there, and when they left before their stay was up. */
    arrivedAt: ts("arrived_at"),
    leftAt: ts("left_at"),
    /** The mood given at a check-in, 1 (worst) to 5 (best). */
    mood: integer("mood"),
    /** The journal entry written to complete a journal task. */
    journalNoteId: uuid("journal_note_id").references((): AnyPgColumn => notes.id, { onDelete: "set null" }),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: ts("reviewed_at"),
    /** Cancelled because someone called it off around a plan (not because its series was edited); history shows these. */
    calledOff: boolean("called_off").notNull().default(false),
    /** When a Dominant marked this miss as seen and left it missed, so it stops asking for a decision. */
    missConfirmedAt: ts("miss_confirmed_at"),
    /** A low check-in (1 or 2) asks a Dominant's attention until they reply or mark it seen. */
    moodSeenAt: ts("mood_seen_at"),
    /** A curfew night where the sub tells the Dominant they're home: when they did, and the line they sent. */
    homeToldAt: ts("home_told_at"),
    homeNote: text("home_note"),
    /** Who last corrected this by hand from the task's history, and when. */
    editedBy: uuid("edited_by").references(() => users.id),
    editedAt: ts("edited_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("occurrences_series_date_uq").on(t.seriesId, t.originalDate), index("occurrences_due_idx").on(t.status, t.dueAt)],
);

export const reschedules = pgTable("reschedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  occurrenceId: uuid("occurrence_id")
    .notNull()
    .references(() => occurrences.id, { onDelete: "cascade" }),
  relationshipId: uuid("relationship_id")
    .notNull()
    .references(() => relationships.id, { onDelete: "cascade" }),
  /** Shared by the rows of one "more time for the whole day" request; decided together. */
  groupId: uuid("group_id"),
  requestedBy: uuid("requested_by")
    .notNull()
    .references(() => users.id),
  decidedBy: uuid("decided_by").references(() => users.id),
  scope: text("scope", { enum: ["this", "following"] }).notNull(),
  /** `cancel` asks to call this occurrence off (it becomes excused); its toDueAt is just fromDueAt. */
  kind: text("kind", { enum: ["move", "cancel"] })
    .notNull()
    .default("move"),
  fromDueAt: ts("from_due_at").notNull(),
  toDueAt: ts("to_due_at").notNull(),
  reason: text("reason"),
  /** `applied` = made directly by someone allowed to; `approved` = requested then approved. */
  status: text("status", { enum: ["requested", "approved", "declined", "applied"] }).notNull(),
  usedAllowance: boolean("used_allowance").notNull().default(false),
  /** A delay from the allowance stays on the Dominant's Today until they close it. */
  seenAt: ts("seen_at"),
  createdAt: createdAt(),
  decidedAt: ts("decided_at"),
});

export const pointsLedger = pgTable(
  "points_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    relationshipId: uuid("relationship_id")
      .notNull()
      .references(() => relationships.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    delta: integer("delta").notNull(),
    kind: text("kind", { enum: ["completion", "miss", "redemption", "adjustment", "delay"] }).notNull(),
    note: text("note").notNull().default(""),
    occurrenceId: uuid("occurrence_id").references(() => occurrences.id, { onDelete: "set null" }),
    rewardId: uuid("reward_id").references(() => rewards.id, { onDelete: "set null" }),
    /** A redemption waits on a Dominant until they mark it redeemed, with an optional note to the sub. */
    redeemedAt: ts("redeemed_at"),
    redeemedBy: uuid("redeemed_by").references(() => users.id, { onDelete: "set null" }),
    redeemNote: text("redeem_note"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    index("ledger_relationship_user_idx").on(t.relationshipId, t.userId),
    // One completion/miss entry per occurrence, so retries can't double-count points.
    uniqueIndex("ledger_occurrence_kind_uq")
      .on(t.occurrenceId, t.kind)
      .where(sql`${t.occurrenceId} is not null`),
  ],
);

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    relationshipId: uuid("relationship_id")
      .notNull()
      .references(() => relationships.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    kind: text("kind", { enum: ["note", "journal"] })
      .notNull()
      .default("note"),
    title: text("title").notNull().default(""),
    bodyMd: text("body_md").notNull(),
    visibility: text("visibility", { enum: ["private", "shared"] })
      .notNull()
      .default("shared"),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    pinned: boolean("pinned").notNull().default(false),
    mood: integer("mood"),
    /** A Dominant's shared note the submissive may edit too. */
    subCanEdit: boolean("sub_can_edit").notNull().default(false),
    commentCount: integer("comment_count").notNull().default(0),
    /** How many earlier versions of the title and text are kept in note_revisions. */
    revisionCount: integer("revision_count").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("notes_relationship_idx").on(t.relationshipId)],
);

export const devices = pgTable("devices", {
  token: text("token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform", { enum: ["android", "web"] }).notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  /** The last push FCM accepted for this token, and the error from the last one it refused (cleared on success). */
  lastSentAt: ts("last_sent_at"),
  lastError: text("last_error"),
});

/** A photo attached to an occurrence as proof. Deleting the row is the purge; nothing is kept elsewhere. */
export const proofPhotos = pgTable(
  "proof_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    occurrenceId: uuid("occurrence_id")
      .notNull()
      .references(() => occurrences.id, { onDelete: "cascade" }),
    uploaderId: uuid("uploader_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    data: bytea("data").notNull(),
    contentType: text("content_type").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("proof_photos_occurrence_idx").on(t.occurrenceId)],
);

/** A report of a photo or a person, for the moderation queue Play requires. */
export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  reporterId: uuid("reporter_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  subjectId: uuid("subject_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /** The photo reported, if any. Not a foreign key: the report outlives a deleted photo. */
  photoId: uuid("photo_id"),
  reason: text("reason", { enum: ["minor", "non_consensual", "illegal", "other"] }).notNull(),
  details: text("details"),
  createdAt: createdAt(),
  resolvedAt: ts("resolved_at"),
});

/** A plan on the shared calendar, added by either partner. */
export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    relationshipId: uuid("relationship_id")
      .notNull()
      .references(() => relationships.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    allDay: boolean("all_day").notNull().default(false),
    withPartner: boolean("with_partner").notNull().default(false),
    noteMd: text("note_md"),
    /** Tasks someone said are fine alongside this plan; they no longer count as clashes. */
    dismissedIds: jsonb("dismissed_ids").$type<string[]>().notNull().default([]),
    /** Someone other than the author changed the plan (a Dominant moving its end); the author is told until they've seen it. */
    changedBy: uuid("changed_by").references(() => users.id, { onDelete: "set null" }),
    previousEndsAt: ts("previous_ends_at"),
    changeSeenAt: ts("change_seen_at"),
    /** The Dominant's optional note with that change. */
    changeNote: text("change_note"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("calendar_events_relationship_idx").on(t.relationshipId, t.startsAt)],
);

/** A named spot a Dominant saved, for location tasks. Arriving inside the radius counts. */
export const places = pgTable(
  "places",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    relationshipId: uuid("relationship_id")
      .notNull()
      .references(() => relationships.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    address: text("address"),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    radiusM: integer("radius_m").notNull().default(150),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("places_relationship_idx").on(t.relationshipId)],
);

/** An arrival, departure or check-in a phone or browser reported for a location task. Kept as the record. */
export const locationEvents = pgTable(
  "location_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    occurrenceId: uuid("occurrence_id")
      .notNull()
      .references(() => occurrences.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["enter", "exit", "checkin", "tap"] }).notNull(),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    accuracyM: integer("accuracy_m"),
    at: ts("at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("location_events_occurrence_idx").on(t.occurrenceId)],
);

/** Someone a person never wants to pair with again. Checked both ways when joining. */
export const blocks = pgTable(
  "blocks",
  {
    blockerId: uuid("blocker_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blockedId: uuid("blocked_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] }), index("blocks_blocked_idx").on(t.blockedId)],
);

/** A remark on one occurrence ("why was this late"), so the conversation stays with the task. */
export const occurrenceComments = pgTable(
  "occurrence_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    occurrenceId: uuid("occurrence_id")
      .notNull()
      .references(() => occurrences.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("occurrence_comments_occurrence_idx").on(t.occurrenceId, t.createdAt)],
);

/** A reply under a journal entry or shared note, from anyone who can read it. */
export const noteComments = pgTable(
  "note_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    noteId: uuid("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("note_comments_note_idx").on(t.noteId, t.createdAt)],
);

/** A note's title and text as they were before an edit, so changes to a journal entry stay visible. */
export const noteRevisions = pgTable(
  "note_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    noteId: uuid("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    /** Who made the edit that replaced this version. */
    editorId: uuid("editor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    bodyMd: text("body_md").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("note_revisions_note_idx").on(t.noteId, t.createdAt)],
);

/** A safe word called in a dynamic: yellow (slow down, check in) or red (stop). Open until someone clears it. */
export const safeCalls = pgTable(
  "safe_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    relationshipId: uuid("relationship_id")
      .notNull()
      .references(() => relationships.id, { onDelete: "cascade" }),
    callerId: uuid("caller_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    level: text("level", { enum: ["yellow", "red"] }).notNull(),
    note: text("note").notNull().default(""),
    createdAt: createdAt(),
    clearedAt: timestamp("cleared_at", { withTimezone: true }),
    clearedBy: uuid("cleared_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [index("safe_calls_relationship_idx").on(t.relationshipId, t.createdAt)],
);

/** The focus a Dominant sets for a calendar month ("2026-10"), and the tasks that count towards it. */
export const monthFocuses = pgTable(
  "month_focuses",
  {
    relationshipId: uuid("relationship_id")
      .notNull()
      .references(() => relationships.id, { onDelete: "cascade" }),
    month: text("month").notNull(),
    goal: text("goal").notNull(),
    taskIds: jsonb("task_ids").$type<string[]>().notNull().default([]),
    setBy: uuid("set_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.relationshipId, t.month] })],
);

/** One person's look back on a month: how well the focus was kept, what went well, what to work on. */
export const monthReviews = pgTable(
  "month_reviews",
  {
    relationshipId: uuid("relationship_id")
      .notNull()
      .references(() => relationships.id, { onDelete: "cascade" }),
    month: text("month").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    wentWell: text("went_well").notNull().default(""),
    workOn: text("work_on").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.relationshipId, t.month, t.userId] })],
);

/** Who has been told a month's review is open, so each person hears it once. */
export const monthPrompts = pgTable(
  "month_prompts",
  {
    relationshipId: uuid("relationship_id")
      .notNull()
      .references(() => relationships.id, { onDelete: "cascade" }),
    month: text("month").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sentAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.relationshipId, t.month, t.userId] })],
);

/** Calls to outside services by day (address search, for now), to notice before a free service is outgrown. */
export const usageDaily = pgTable(
  "usage_daily",
  {
    day: date("day").notNull(),
    kind: text("kind").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.day, t.kind] })],
);

/** A sub asking for a later curfew one night, from Today or from a plan that runs past it; a Dominant decides. */
export const curfewRequests = pgTable(
  "curfew_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    relationshipId: uuid("relationship_id")
      .notNull()
      .references(() => relationships.id, { onDelete: "cascade" }),
    occurrenceId: uuid("occurrence_id")
      .notNull()
      .references(() => occurrences.id, { onDelete: "cascade" }),
    /** The plan it was asked from, if any. */
    eventId: uuid("event_id").references(() => calendarEvents.id, { onDelete: "set null" }),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Curfew as it was, and the home-by asked for. */
    fromDueAt: ts("from_due_at").notNull(),
    untilAt: ts("until_at").notNull(),
    reason: text("reason"),
    status: text("status", { enum: ["pending", "approved", "declined"] })
      .notNull()
      .default("pending"),
    /** What the Dominant approved; may be earlier than asked. */
    grantedAt: ts("granted_at"),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: ts("decided_at"),
    createdAt: createdAt(),
  },
  (t) => [index("curfew_requests_relationship_idx").on(t.relationshipId, t.status)],
);

/** One version of a dynamic's agreement; at most one is open (proposed or sent back) at a time. */
export const agreementVersions = pgTable(
  "agreement_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    relationshipId: uuid("relationship_id")
      .notNull()
      .references(() => relationships.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    status: text("status", { enum: ["proposed", "changes_requested", "agreed", "superseded"] }).notNull(),
    sections: jsonb("sections").$type<AgreementSectionInput[]>().notNull(),
    /** Rule and protocol titles as they stood when the version was proposed. */
    items: jsonb("items").$type<{ rules: string[]; protocols: string[] }>().notNull(),
    reviewBy: date("review_by"),
    note: text("note").notNull().default(""),
    proposedBy: uuid("proposed_by").references(() => users.id, { onDelete: "set null" }),
    proposedAt: ts("proposed_at").notNull(),
    agreedAt: ts("agreed_at"),
    feedbackBy: uuid("feedback_by").references(() => users.id, { onDelete: "set null" }),
    feedbackNote: text("feedback_note"),
    feedbackAt: ts("feedback_at"),
  },
  (t) => [uniqueIndex("agreement_versions_number_idx").on(t.relationshipId, t.number)],
);

export const agreementSignatures = pgTable(
  "agreement_signatures",
  {
    versionId: uuid("version_id")
      .notNull()
      .references(() => agreementVersions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    agreedAt: ts("agreed_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.versionId, t.userId] })],
);

/** A rule or protocol someone else added, changed or removed, until this person has seen it on Today. */
export const libraryChanges = pgTable(
  "library_changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    relationshipId: uuid("relationship_id")
      .notNull()
      .references(() => relationships.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    changedBy: uuid("changed_by").references(() => users.id, { onDelete: "set null" }),
    kind: text("kind", { enum: ["rules", "protocols"] }).notNull(),
    verb: text("verb", { enum: ["added", "changed", "removed"] }).notNull(),
    /** Not a reference: a removed item is gone. */
    itemId: uuid("item_id").notNull(),
    title: text("title").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("library_changes_user_idx").on(t.userId, t.relationshipId)],
);

/** A scene someone in the dynamic logged. */
export const scenes = pgTable(
  "scenes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    relationshipId: uuid("relationship_id")
      .notNull()
      .references(() => relationships.id, { onDelete: "cascade" }),
    title: text("title").notNull().default(""),
    occurredAt: ts("occurred_at").notNull(),
    timezone: text("timezone").notNull(),
    what: text("what").notNull().default(""),
    safeword: text("safeword", { enum: ["none", "yellow", "red"] })
      .notNull()
      .default("none"),
    aftercare: jsonb("aftercare").$type<string[]>().notNull().default([]),
    loggedBy: uuid("logged_by").references(() => users.id, { onDelete: "set null" }),
    /** 10:00 the day after, in [timezone]: the next-day check-in opens and its push goes out. */
    checkFrom: ts("check_from").notNull(),
    checkPushedAt: ts("check_pushed_at"),
    commentCount: integer("comment_count").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("scenes_relationship_idx").on(t.relationshipId, t.occurredAt)],
);

/** One person's part in a scene: their shared side, their next-day check-in, and whether they closed the aftercare card. */
export const sceneMembers = pgTable(
  "scene_members",
  {
    sceneId: uuid("scene_id")
      .notNull()
      .references(() => scenes.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mood: integer("mood"),
    worked: text("worked").notNull().default(""),
    change: text("change").notNull().default(""),
    need: text("need").notNull().default(""),
    sharedAt: ts("shared_at"),
    checkMood: integer("check_mood"),
    checkNote: text("check_note").notNull().default(""),
    checkAt: ts("check_at"),
    aftercareDoneAt: ts("aftercare_done_at"),
  },
  (t) => [primaryKey({ columns: [t.sceneId, t.userId] })],
);

export const sceneComments = pgTable(
  "scene_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sceneId: uuid("scene_id")
      .notNull()
      .references(() => scenes.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("scene_comments_scene_idx").on(t.sceneId, t.createdAt)],
);

/** What someone needs after a scene, per dynamic. */
export const aftercarePlans = pgTable(
  "aftercare_plans",
  {
    relationshipId: uuid("relationship_id")
      .notNull()
      .references(() => relationships.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    needs: jsonb("needs").$type<string[]>().notNull().default([]),
    note: text("note").notNull().default(""),
    updatedAt: ts("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.relationshipId, t.userId] })],
);

/** A kit someone saved from a dynamic: a copy of the items, theirs alone, shareable by code. */
export const kits = pgTable(
  "kits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    items: jsonb("items").$type<KitItem[]>().notNull().default([]),
    /** Set while shared; cleared to stop sharing, and a new one is made if it's shared again. */
    shareCode: text("share_code"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("kits_owner_idx").on(t.ownerId), uniqueIndex("kits_share_code_uq").on(t.shareCode)],
);

/**
 * A Dominant and a submissive trading roles. Asked by one, it starts only when the other accepts; it ends when
 * either ends it or at endsAt. While active the memberships carry the swapped roles.
 */
export const roleSwaps = pgTable(
  "role_swaps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    relationshipId: uuid("relationship_id")
      .notNull()
      .references(() => relationships.id, { onDelete: "cascade" }),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    partnerId: uuid("partner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["pending", "active", "ended", "declined", "cancelled"] }).notNull(),
    /** Null: until someone swaps back. */
    endsAt: ts("ends_at"),
    pauseTasks: boolean("pause_tasks").notNull().default(true),
    /** Whose tasks are paused while it's active: the submissive from before the swap. */
    pausedUserId: uuid("paused_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    startedAt: ts("started_at"),
    endedAt: ts("ended_at"),
    /** Null when the time ran out. */
    endedBy: uuid("ended_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [index("role_swaps_relationship_idx").on(t.relationshipId, t.createdAt)],
);

/** A chastity lock. One open (pending, active or on a break) per wearer per dynamic. */
export const chastityLocks = pgTable(
  "chastity_locks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    relationshipId: uuid("relationship_id")
      .notNull()
      .references(() => relationships.id, { onDelete: "cascade" }),
    wearerId: uuid("wearer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    keyholderId: uuid("keyholder_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["pending", "active", "break", "ended", "declined", "cancelled"] }).notNull(),
    keyMode: text("key_mode", { enum: ["keyholder", "keybox"] }).notNull(),
    /** Asked-for length; null when open-ended. */
    minutes: integer("minutes"),
    hideTime: boolean("hide_time").notNull().default(false),
    startedAt: ts("started_at"),
    endsAt: ts("ends_at"),
    breakEndsAt: ts("break_ends_at"),
    /** The photo of the keybox code, sealed until release. Replaced on every relock. */
    keybox: bytea("keybox"),
    keyboxType: text("keybox_type"),
    createdAt: createdAt(),
    endedAt: ts("ended_at"),
    endedBy: uuid("ended_by").references(() => users.id, { onDelete: "set null" }),
    endReason: text("end_reason", { enum: ["time", "released"] }),
  },
  (t) => [index("chastity_locks_relationship_idx").on(t.relationshipId, t.createdAt)],
);

/** What happened during a lock: time changes, asks for release or a break and their answers, photo asks. */
export const chastityEvents = pgTable(
  "chastity_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lockId: uuid("lock_id")
      .notNull()
      .references(() => chastityLocks.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["started", "time", "release_ask", "break", "photo_ask", "relocked", "ended"] }).notNull(),
    status: text("status", { enum: ["pending", "approved", "declined", "done", "overdue"] }),
    minutes: integer("minutes"),
    note: text("note"),
    byId: uuid("by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    decidedAt: ts("decided_at"),
    /** Time a missed task's consequence added, or a redeemed reward took off; each at most once. */
    causedByOccurrenceId: uuid("caused_by_occurrence_id").unique(),
    ledgerId: uuid("ledger_id").unique(),
    taskId: uuid("task_id").references(() => taskSeries.id, { onDelete: "set null" }),
  },
  (t) => [index("chastity_events_lock_idx").on(t.lockId, t.createdAt)],
);
