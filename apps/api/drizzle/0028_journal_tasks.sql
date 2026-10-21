ALTER TABLE "occurrences" ADD COLUMN "journal_note_id" uuid;--> statement-breakpoint
ALTER TABLE "task_series" ADD COLUMN "asks_journal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "occurrences" ADD CONSTRAINT "occurrences_journal_note_id_notes_id_fk" FOREIGN KEY ("journal_note_id") REFERENCES "public"."notes"("id") ON DELETE set null ON UPDATE no action;