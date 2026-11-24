insert into occurrences (series_id, original_date, due_at, original_due_at, status, completed_at)
select o.series_id, o.original_date - d, o.due_at - (d||' days')::interval, o.original_due_at - (d||' days')::interval,
  case when (d + abs(hashtext(o.series_id::text))) % 6 = 0 then 'missed' else 'completed' end,
  case when (d + abs(hashtext(o.series_id::text))) % 6 = 0 then null else o.due_at - (d||' days')::interval - interval '1 hour' end
from occurrences o join task_series s on s.id=o.series_id, generate_series(1,9) d
where o.original_date = (select min(original_date) from occurrences) and s.title not in ('Tidy the desk','Write 50 lines')
on conflict do nothing;
update task_series set created_at = now() - interval '12 days';
