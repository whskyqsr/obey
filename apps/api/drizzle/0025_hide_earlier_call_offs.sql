-- Call-offs made before 0024 left occurrences that were still to come as "excused". Hide them like new call-offs:
-- the ones whose call-off was decided before their due time (a missed one called off stays excused).
UPDATE "occurrences" o
SET "status" = 'cancelled', "called_off" = true
FROM "reschedules" r
WHERE r."occurrence_id" = o."id"
  AND r."kind" = 'cancel'
  AND r."status" IN ('approved', 'applied')
  AND r."decided_at" IS NOT NULL
  AND r."from_due_at" > r."decided_at"
  AND o."status" = 'excused';
