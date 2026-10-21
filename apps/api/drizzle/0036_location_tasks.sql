CREATE TABLE "location_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurrence_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"accuracy_m" integer,
	"at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"relationship_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"radius_m" integer DEFAULT 150 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "location_paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "location_paused_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "occurrences" ADD COLUMN "arrived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "occurrences" ADD COLUMN "left_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "task_series" ADD COLUMN "place_id" uuid;--> statement-breakpoint
ALTER TABLE "task_series" ADD COLUMN "stay_minutes" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "location_status" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "location_status_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "location_events" ADD CONSTRAINT "location_events_occurrence_id_occurrences_id_fk" FOREIGN KEY ("occurrence_id") REFERENCES "public"."occurrences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_events" ADD CONSTRAINT "location_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "location_events_occurrence_idx" ON "location_events" USING btree ("occurrence_id");--> statement-breakpoint
CREATE INDEX "places_relationship_idx" ON "places" USING btree ("relationship_id");--> statement-breakpoint
ALTER TABLE "task_series" ADD CONSTRAINT "task_series_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE set null ON UPDATE no action;