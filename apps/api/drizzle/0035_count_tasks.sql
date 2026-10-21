ALTER TABLE "occurrences" ADD COLUMN "count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "task_series" ADD COLUMN "count_min" integer;--> statement-breakpoint
ALTER TABLE "task_series" ADD COLUMN "count_max" integer;--> statement-breakpoint
ALTER TABLE "task_series" ADD COLUMN "count_per" text DEFAULT 'task' NOT NULL;