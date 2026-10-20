import { sql } from "drizzle-orm";
import { boolean, customType, date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import type { DynamicDate, Features } from "@obey/contracts";
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
  /** Anniversaries and other dates the dynamic marks. */
  dates: jsonb("dates").$type<DynamicDate[]>().notNull().default([]),
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
    reminderSentAt: ts("reminder_sent_at"),
    noteMd: text("note_md"),
    /** Kept in step with proof_photos, so lists can show a count without a join. */
    photoCount: integer("photo_count").notNull().default(0),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: ts("reviewed_at"),
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
  fromDueAt: ts("from_due_at").notNull(),
  toDueAt: ts("to_due_at").notNull(),
  reason: text("reason"),
  /** `applied` = made directly by someone allowed to; `approved` = requested then approved. */
  status: text("status", { enum: ["requested", "approved", "declined", "applied"] }).notNull(),
  usedAllowance: boolean("used_allowance").notNull().default(false),
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
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("calendar_events_relationship_idx").on(t.relationshipId, t.startsAt)],
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
