import { sql } from "drizzle-orm";
import type { Tx } from "../db/index.js";

/**
 * Deletes proof photos in dynamics that keep them for a set time, once that many days have passed since the task was
 * settled (reviewed, done, missed or excused). A photo with an open report stays until the report is resolved.
 */
export async function deleteOldProofs(db: Tx, now: Date) {
  await db.execute(sql`
    with gone as (
      delete from proof_photos p
      using occurrences o, task_series s, relationships r
      where p.occurrence_id = o.id and o.series_id = s.id and s.relationship_id = r.id
        and r.proof_days is not null
        and o.status in ('completed', 'missed', 'excused', 'cancelled')
        and coalesce(o.reviewed_at, o.completed_at, o.due_at) < ${now.toISOString()}::timestamptz - make_interval(days => r.proof_days)
        and not exists (select 1 from reports rp where rp.photo_id = p.id and rp.resolved_at is null)
      returning p.occurrence_id
    )
    update occurrences o set photo_count = greatest(o.photo_count - c.n, 0)
    from (select occurrence_id, count(*)::int as n from gone group by occurrence_id) c
    where o.id = c.occurrence_id`);
}
