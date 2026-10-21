CREATE TABLE "safe_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"relationship_id" uuid NOT NULL,
	"caller_id" uuid NOT NULL,
	"level" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cleared_at" timestamp with time zone,
	"cleared_by" uuid
);
--> statement-breakpoint
ALTER TABLE "safe_calls" ADD CONSTRAINT "safe_calls_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safe_calls" ADD CONSTRAINT "safe_calls_caller_id_users_id_fk" FOREIGN KEY ("caller_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safe_calls" ADD CONSTRAINT "safe_calls_cleared_by_users_id_fk" FOREIGN KEY ("cleared_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "safe_calls_relationship_idx" ON "safe_calls" USING btree ("relationship_id","created_at");