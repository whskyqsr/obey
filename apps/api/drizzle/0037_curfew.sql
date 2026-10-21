ALTER TABLE "relationships" ADD COLUMN "curfew" jsonb;--> statement-breakpoint
ALTER TABLE "task_series" ADD COLUMN "curfew_until" text;