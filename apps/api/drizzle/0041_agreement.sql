CREATE TABLE "agreement_signatures" (
	"version_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"agreed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "agreement_signatures_version_id_user_id_pk" PRIMARY KEY("version_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "agreement_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"relationship_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"status" text NOT NULL,
	"sections" jsonb NOT NULL,
	"items" jsonb NOT NULL,
	"review_by" date,
	"note" text DEFAULT '' NOT NULL,
	"proposed_by" uuid,
	"proposed_at" timestamp with time zone NOT NULL,
	"agreed_at" timestamp with time zone,
	"feedback_by" uuid,
	"feedback_note" text,
	"feedback_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "agreement_signatures" ADD CONSTRAINT "agreement_signatures_version_id_agreement_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."agreement_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_signatures" ADD CONSTRAINT "agreement_signatures_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_versions" ADD CONSTRAINT "agreement_versions_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_versions" ADD CONSTRAINT "agreement_versions_proposed_by_users_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_versions" ADD CONSTRAINT "agreement_versions_feedback_by_users_id_fk" FOREIGN KEY ("feedback_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agreement_versions_number_idx" ON "agreement_versions" USING btree ("relationship_id","number");