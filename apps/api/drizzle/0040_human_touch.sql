ALTER TABLE "occurrences" ADD COLUMN "mood_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "occurrences" ADD COLUMN "home_told_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "occurrences" ADD COLUMN "home_note" text;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD COLUMN "redeemed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD COLUMN "redeemed_by" uuid;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD COLUMN "redeem_note" text;--> statement-breakpoint
ALTER TABLE "reschedules" ADD COLUMN "seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rewards" ADD COLUMN "lets_off" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "task_series" ADD COLUMN "reminder" text DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE "task_series" ADD COLUMN "reminder_text" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "notify_details" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_redeemed_by_users_id_fk" FOREIGN KEY ("redeemed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
UPDATE "points_ledger" SET "redeemed_at" = "created_at" WHERE "kind" = 'redemption';--> statement-breakpoint
UPDATE "occurrences" SET "mood_seen_at" = "completed_at" WHERE "mood" IS NOT NULL;--> statement-breakpoint
UPDATE "reschedules" SET "seen_at" = "created_at" WHERE "used_allowance";
