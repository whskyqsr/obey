ALTER TABLE "calendar_events" ADD COLUMN "series_id" uuid;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "repeat" jsonb;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "pause_tasks" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "pause_status" text;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "pause_decided_by" uuid;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_pause_decided_by_users_id_fk" FOREIGN KEY ("pause_decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_events_series_idx" ON "calendar_events" USING btree ("series_id");