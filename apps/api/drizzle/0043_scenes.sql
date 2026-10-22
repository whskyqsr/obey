CREATE TABLE "aftercare_plans" (
	"relationship_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"needs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "aftercare_plans_relationship_id_user_id_pk" PRIMARY KEY("relationship_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "scene_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scene_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scene_members" (
	"scene_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"mood" integer,
	"worked" text DEFAULT '' NOT NULL,
	"change" text DEFAULT '' NOT NULL,
	"need" text DEFAULT '' NOT NULL,
	"shared_at" timestamp with time zone,
	"check_mood" integer,
	"check_note" text DEFAULT '' NOT NULL,
	"check_at" timestamp with time zone,
	"aftercare_done_at" timestamp with time zone,
	CONSTRAINT "scene_members_scene_id_user_id_pk" PRIMARY KEY("scene_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "scenes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"relationship_id" uuid NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"timezone" text NOT NULL,
	"what" text DEFAULT '' NOT NULL,
	"safeword" text DEFAULT 'none' NOT NULL,
	"aftercare" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"logged_by" uuid,
	"check_from" timestamp with time zone NOT NULL,
	"check_pushed_at" timestamp with time zone,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "aftercare_plans" ADD CONSTRAINT "aftercare_plans_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aftercare_plans" ADD CONSTRAINT "aftercare_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_comments" ADD CONSTRAINT "scene_comments_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_comments" ADD CONSTRAINT "scene_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_members" ADD CONSTRAINT "scene_members_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_members" ADD CONSTRAINT "scene_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_logged_by_users_id_fk" FOREIGN KEY ("logged_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scene_comments_scene_idx" ON "scene_comments" USING btree ("scene_id","created_at");--> statement-breakpoint
CREATE INDEX "scenes_relationship_idx" ON "scenes" USING btree ("relationship_id","occurred_at");