CREATE TABLE "curfew_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"relationship_id" uuid NOT NULL,
	"occurrence_id" uuid NOT NULL,
	"event_id" uuid,
	"requested_by" uuid NOT NULL,
	"from_due_at" timestamp with time zone NOT NULL,
	"until_at" timestamp with time zone NOT NULL,
	"reason" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"granted_at" timestamp with time zone,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "changed_by" uuid;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "previous_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "change_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "curfew_requests" ADD CONSTRAINT "curfew_requests_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curfew_requests" ADD CONSTRAINT "curfew_requests_occurrence_id_occurrences_id_fk" FOREIGN KEY ("occurrence_id") REFERENCES "public"."occurrences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curfew_requests" ADD CONSTRAINT "curfew_requests_event_id_calendar_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."calendar_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curfew_requests" ADD CONSTRAINT "curfew_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curfew_requests" ADD CONSTRAINT "curfew_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "curfew_requests_relationship_idx" ON "curfew_requests" USING btree ("relationship_id","status");--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;