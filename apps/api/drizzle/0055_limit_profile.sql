CREATE TABLE "limit_prefilled" (
	"relationship_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"filled_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "limit_prefilled_relationship_id_user_id_pk" PRIMARY KEY("relationship_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "limit_profile" (
	"user_id" uuid NOT NULL,
	"item_key" text NOT NULL,
	"side" text NOT NULL,
	"rating" text,
	"note" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "limit_profile_user_id_item_key_side_pk" PRIMARY KEY("user_id","item_key","side")
);
--> statement-breakpoint
ALTER TABLE "limit_prefilled" ADD CONSTRAINT "limit_prefilled_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "limit_prefilled" ADD CONSTRAINT "limit_prefilled_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "limit_profile" ADD CONSTRAINT "limit_profile_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;