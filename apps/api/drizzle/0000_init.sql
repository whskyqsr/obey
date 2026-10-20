CREATE TABLE "consequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"relationship_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body_md" text DEFAULT '' NOT NULL,
	"severity" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"code" text PRIMARY KEY NOT NULL,
	"relationship_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"relationship_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_relationship_id_user_id_pk" PRIMARY KEY("relationship_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"relationship_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"kind" text DEFAULT 'note' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"body_md" text NOT NULL,
	"visibility" text DEFAULT 'shared' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"mood" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"series_id" uuid NOT NULL,
	"original_date" date NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"original_due_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"completed_at" timestamp with time zone,
	"reminder_sent_at" timestamp with time zone,
	"note_md" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "points_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"relationship_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"kind" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"occurrence_id" uuid,
	"reward_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"reschedule_policy" text DEFAULT 'request' NOT NULL,
	"weekly_delay_allowance" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reschedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurrence_id" uuid NOT NULL,
	"relationship_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"decided_by" uuid,
	"scope" text NOT NULL,
	"from_due_at" timestamp with time zone NOT NULL,
	"to_due_at" timestamp with time zone NOT NULL,
	"reason" text,
	"status" text NOT NULL,
	"used_allowance" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"relationship_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body_md" text DEFAULT '' NOT NULL,
	"cost" integer NOT NULL,
	"needs_approval" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"relationship_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body_md" text DEFAULT '' NOT NULL,
	"category" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"relationship_id" uuid NOT NULL,
	"assignee_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body_md" text DEFAULT '' NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"miss_penalty" integer DEFAULT 0 NOT NULL,
	"reward_id" uuid,
	"consequence_id" uuid,
	"proof_required" boolean DEFAULT false NOT NULL,
	"approval_required" boolean DEFAULT false NOT NULL,
	"schedule" jsonb NOT NULL,
	"due_time" text,
	"timezone" text NOT NULL,
	"grace_minutes" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"superseded_by" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_uid" text NOT NULL,
	"display_name" text NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_auth_uid_unique" UNIQUE("auth_uid")
);
--> statement-breakpoint
ALTER TABLE "consequences" ADD CONSTRAINT "consequences_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_used_by_users_id_fk" FOREIGN KEY ("used_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occurrences" ADD CONSTRAINT "occurrences_series_id_task_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."task_series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occurrences" ADD CONSTRAINT "occurrences_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_occurrence_id_occurrences_id_fk" FOREIGN KEY ("occurrence_id") REFERENCES "public"."occurrences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_reward_id_rewards_id_fk" FOREIGN KEY ("reward_id") REFERENCES "public"."rewards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reschedules" ADD CONSTRAINT "reschedules_occurrence_id_occurrences_id_fk" FOREIGN KEY ("occurrence_id") REFERENCES "public"."occurrences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reschedules" ADD CONSTRAINT "reschedules_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reschedules" ADD CONSTRAINT "reschedules_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reschedules" ADD CONSTRAINT "reschedules_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_series" ADD CONSTRAINT "task_series_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_series" ADD CONSTRAINT "task_series_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_series" ADD CONSTRAINT "task_series_reward_id_rewards_id_fk" FOREIGN KEY ("reward_id") REFERENCES "public"."rewards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_series" ADD CONSTRAINT "task_series_consequence_id_consequences_id_fk" FOREIGN KEY ("consequence_id") REFERENCES "public"."consequences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_series" ADD CONSTRAINT "task_series_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notes_relationship_idx" ON "notes" USING btree ("relationship_id");--> statement-breakpoint
CREATE UNIQUE INDEX "occurrences_series_date_uq" ON "occurrences" USING btree ("series_id","original_date");--> statement-breakpoint
CREATE INDEX "occurrences_due_idx" ON "occurrences" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "ledger_relationship_user_idx" ON "points_ledger" USING btree ("relationship_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_occurrence_kind_uq" ON "points_ledger" USING btree ("occurrence_id","kind") WHERE "points_ledger"."occurrence_id" is not null;--> statement-breakpoint
CREATE INDEX "task_series_relationship_idx" ON "task_series" USING btree ("relationship_id");