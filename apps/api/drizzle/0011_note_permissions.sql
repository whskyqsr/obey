ALTER TABLE "notes" ADD COLUMN "sub_can_edit" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "relationships" ADD COLUMN "sub_notes" boolean DEFAULT true NOT NULL;