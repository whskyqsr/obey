ALTER TABLE "occurrences" ADD COLUMN "steps_done" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "task_series" ADD COLUMN "steps" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "task_series" ADD COLUMN "window_minutes" integer;