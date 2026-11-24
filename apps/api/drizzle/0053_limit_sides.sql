-- Each limits answer now belongs to a side: "dom" (the person in charge) or "sub" (their partner in charge).
-- Existing answers were given "for you, in your role", so they move to the side that role implies. A switch's go
-- opposite their partner's role, which is how the old comparison read them; with no such partner, they go to both.
ALTER TABLE "limit_ratings" DROP CONSTRAINT "limit_ratings_relationship_id_user_id_item_key_pk";--> statement-breakpoint
ALTER TABLE "limit_ratings" ADD COLUMN "side" text;--> statement-breakpoint
UPDATE "limit_ratings" r SET "side" = CASE m."role" WHEN 'dominant' THEN 'dom' ELSE 'sub' END
  FROM "memberships" m
  WHERE m."relationship_id" = r."relationship_id" AND m."user_id" = r."user_id" AND m."role" IN ('dominant', 'submissive');--> statement-breakpoint
UPDATE "limit_ratings" r SET "side" = CASE p."role" WHEN 'dominant' THEN 'sub' ELSE 'dom' END
  FROM "memberships" p
  WHERE r."side" IS NULL AND p."relationship_id" = r."relationship_id" AND p."user_id" <> r."user_id" AND p."role" IN ('dominant', 'submissive');--> statement-breakpoint
INSERT INTO "limit_ratings" ("relationship_id", "user_id", "item_key", "side", "rating", "note", "updated_at")
  SELECT "relationship_id", "user_id", "item_key", 'sub', "rating", "note", "updated_at" FROM "limit_ratings" WHERE "side" IS NULL;--> statement-breakpoint
UPDATE "limit_ratings" SET "side" = 'dom' WHERE "side" IS NULL;--> statement-breakpoint
ALTER TABLE "limit_ratings" ALTER COLUMN "side" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "limit_ratings" ADD CONSTRAINT "limit_ratings_relationship_id_user_id_item_key_side_pk" PRIMARY KEY("relationship_id","user_id","item_key","side");
