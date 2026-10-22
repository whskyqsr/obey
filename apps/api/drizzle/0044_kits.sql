CREATE TABLE "kits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"share_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kits" ADD CONSTRAINT "kits_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kits_owner_idx" ON "kits" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kits_share_code_uq" ON "kits" USING btree ("share_code");