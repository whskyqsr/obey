ALTER TABLE "task_series" ADD COLUMN "consequence_due_days" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "task_series" ADD COLUMN "consequence_due_time" text;