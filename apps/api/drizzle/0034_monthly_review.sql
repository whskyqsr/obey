CREATE TABLE "month_focuses" (
	"relationship_id" uuid NOT NULL,
	"month" text NOT NULL,
	"goal" text NOT NULL,
	"task_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"set_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "month_focuses_relationship_id_month_pk" PRIMARY KEY("relationship_id","month")
);
--> statement-breakpoint
CREATE TABLE "month_prompts" (
	"relationship_id" uuid NOT NULL,
	"month" text NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "month_prompts_relationship_id_month_user_id_pk" PRIMARY KEY("relationship_id","month","user_id")
);
--> statement-breakpoint
CREATE TABLE "month_reviews" (
	"relationship_id" uuid NOT NULL,
	"month" text NOT NULL,
	"user_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"went_well" text DEFAULT '' NOT NULL,
	"work_on" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "month_reviews_relationship_id_month_user_id_pk" PRIMARY KEY("relationship_id","month","user_id")
);
--> statement-breakpoint
ALTER TABLE "month_focuses" ADD CONSTRAINT "month_focuses_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "month_focuses" ADD CONSTRAINT "month_focuses_set_by_users_id_fk" FOREIGN KEY ("set_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "month_prompts" ADD CONSTRAINT "month_prompts_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "month_prompts" ADD CONSTRAINT "month_prompts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "month_reviews" ADD CONSTRAINT "month_reviews_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "month_reviews" ADD CONSTRAINT "month_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;