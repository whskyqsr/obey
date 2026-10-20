ALTER TABLE "devices" ADD COLUMN "last_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "last_error" text;