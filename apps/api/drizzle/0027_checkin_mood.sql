ALTER TABLE "occurrences" ADD COLUMN "mood" integer;--> statement-breakpoint
ALTER TABLE "task_series" ADD COLUMN "ask_mood" boolean DEFAULT false NOT NULL;