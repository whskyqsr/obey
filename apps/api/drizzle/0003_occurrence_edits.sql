ALTER TABLE "occurrences" ADD COLUMN "edited_by" uuid;--> statement-breakpoint
ALTER TABLE "occurrences" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "occurrences" ADD CONSTRAINT "occurrences_edited_by_users_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;