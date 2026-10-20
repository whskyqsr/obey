CREATE TABLE "rule_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"relationship_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"logged_by" uuid NOT NULL,
	"rule_id" uuid,
	"protocol_id" uuid,
	"title" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"occurred_on" date NOT NULL,
	"consequence_task_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rule_log" ADD CONSTRAINT "rule_log_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_log" ADD CONSTRAINT "rule_log_subject_id_users_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_log" ADD CONSTRAINT "rule_log_logged_by_users_id_fk" FOREIGN KEY ("logged_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_log" ADD CONSTRAINT "rule_log_rule_id_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_log" ADD CONSTRAINT "rule_log_protocol_id_protocols_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."protocols"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_log" ADD CONSTRAINT "rule_log_consequence_task_id_task_series_id_fk" FOREIGN KEY ("consequence_task_id") REFERENCES "public"."task_series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rule_log_relationship_idx" ON "rule_log" USING btree ("relationship_id","occurred_on");