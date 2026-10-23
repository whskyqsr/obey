CREATE TABLE "limit_finished" (
	"relationship_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"finished_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "limit_finished_relationship_id_user_id_pk" PRIMARY KEY("relationship_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "limit_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"relationship_id" uuid NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "limit_ratings" (
	"relationship_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"item_key" text NOT NULL,
	"rating" text,
	"note" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "limit_ratings_relationship_id_user_id_item_key_pk" PRIMARY KEY("relationship_id","user_id","item_key")
);
--> statement-breakpoint
ALTER TABLE "limit_finished" ADD CONSTRAINT "limit_finished_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "limit_finished" ADD CONSTRAINT "limit_finished_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "limit_items" ADD CONSTRAINT "limit_items_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "limit_items" ADD CONSTRAINT "limit_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "limit_ratings" ADD CONSTRAINT "limit_ratings_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "limit_ratings" ADD CONSTRAINT "limit_ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "limit_items_relationship_idx" ON "limit_items" USING btree ("relationship_id");