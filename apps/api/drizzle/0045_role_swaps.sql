CREATE TABLE "role_swaps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"relationship_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"status" text NOT NULL,
	"ends_at" timestamp with time zone,
	"pause_tasks" boolean DEFAULT true NOT NULL,
	"paused_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"ended_by" uuid
);
--> statement-breakpoint
ALTER TABLE "role_swaps" ADD CONSTRAINT "role_swaps_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_swaps" ADD CONSTRAINT "role_swaps_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_swaps" ADD CONSTRAINT "role_swaps_partner_id_users_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_swaps" ADD CONSTRAINT "role_swaps_paused_user_id_users_id_fk" FOREIGN KEY ("paused_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_swaps" ADD CONSTRAINT "role_swaps_ended_by_users_id_fk" FOREIGN KEY ("ended_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "role_swaps_relationship_idx" ON "role_swaps" USING btree ("relationship_id","created_at");