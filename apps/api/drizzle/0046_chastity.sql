CREATE TABLE "chastity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lock_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text,
	"minutes" integer,
	"note" text,
	"by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"caused_by_occurrence_id" uuid,
	"ledger_id" uuid,
	"task_id" uuid,
	CONSTRAINT "chastity_events_caused_by_occurrence_id_unique" UNIQUE("caused_by_occurrence_id"),
	CONSTRAINT "chastity_events_ledger_id_unique" UNIQUE("ledger_id")
);
--> statement-breakpoint
CREATE TABLE "chastity_locks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"relationship_id" uuid NOT NULL,
	"wearer_id" uuid NOT NULL,
	"keyholder_id" uuid NOT NULL,
	"status" text NOT NULL,
	"key_mode" text NOT NULL,
	"minutes" integer,
	"hide_time" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"break_ends_at" timestamp with time zone,
	"keybox" "bytea",
	"keybox_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"ended_by" uuid,
	"end_reason" text
);
--> statement-breakpoint
ALTER TABLE "consequences" ADD COLUMN "lock_minutes" integer;--> statement-breakpoint
ALTER TABLE "rewards" ADD COLUMN "lock_minutes" integer;--> statement-breakpoint
ALTER TABLE "chastity_events" ADD CONSTRAINT "chastity_events_lock_id_chastity_locks_id_fk" FOREIGN KEY ("lock_id") REFERENCES "public"."chastity_locks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chastity_events" ADD CONSTRAINT "chastity_events_by_id_users_id_fk" FOREIGN KEY ("by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chastity_events" ADD CONSTRAINT "chastity_events_task_id_task_series_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task_series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chastity_locks" ADD CONSTRAINT "chastity_locks_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chastity_locks" ADD CONSTRAINT "chastity_locks_wearer_id_users_id_fk" FOREIGN KEY ("wearer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chastity_locks" ADD CONSTRAINT "chastity_locks_keyholder_id_users_id_fk" FOREIGN KEY ("keyholder_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chastity_locks" ADD CONSTRAINT "chastity_locks_ended_by_users_id_fk" FOREIGN KEY ("ended_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chastity_events_lock_idx" ON "chastity_events" USING btree ("lock_id","created_at");--> statement-breakpoint
CREATE INDEX "chastity_locks_relationship_idx" ON "chastity_locks" USING btree ("relationship_id","created_at");