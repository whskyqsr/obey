import { and, asc, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { type DynamicStats, STATS_RANGES, type Tally, allFeatures } from "@obey/contracts";
import { addDays, dueInstant, localDate } from "@obey/recurrence";
import type { Deps } from "../app.js";
import { memberships, occurrences, relationships, taskSeries } from "../db/schema.js";
import { HttpError, forbidden } from "../errors.js";
import { requireMember } from "../services/access.js";
import { taskStats } from "./tasks.js";

const query = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((d) => (STATS_RANGES as readonly number[]).includes(d), "unsupported range")
    .default(30),
  zone: z.string().default("UTC"),
  userId: z.string().uuid().optional(),
});

type Row = { status: string; dueAt: Date; originalDueAt: Date; completedAt: Date | null };

function tally(rows: Row[]): Tally {
  let done = 0,
    missed = 0,
    excused = 0;
  for (const r of rows) {
    if (r.status === "completed") done++;
    else if (r.status === "missed") missed++;
    else excused++;
  }
  return { done, missed, excused, rate: done + missed ? done / (done + missed) : null };
}

const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

/** The first day of each bucket, oldest first, covering `from` to `to`. */
function bucketStarts(from: string, to: string, bucket: DynamicStats["bucket"], weekStart: "sun" | "mon") {
  let start = from;
  if (bucket === "week") start = addDays(from, -((weekday(from) - (weekStart === "mon" ? 1 : 0) + 7) % 7));
  if (bucket === "month") start = `${from.slice(0, 7)}-01`;
  const starts: string[] = [];
  for (let d = start; d <= to; ) {
    starts.push(d);
    if (bucket === "day") d = addDays(d, 1);
    else if (bucket === "week") d = addDays(d, 7);
    else {
      const [y, m] = d.split("-").map(Number) as [number, number];
      d = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    }
  }
  return starts;
}

export const statsRoutes = (deps: Deps) => async (app: FastifyInstance) => {
  const { db } = deps;

  /** How one person's tasks went over the last `days` days, by local due date in `zone`. Defaults to the first sub. */
  app.get<{ Params: { id: string } }>("/relationships/:id/stats", async (req): Promise<DynamicStats> => {
    await requireMember(db, req.params.id, req.user.id);
    const q = query.parse(req.query);
    try {
      localDate(new Date(), q.zone);
    } catch {
      throw new HttpError(400, `unknown timezone ${q.zone}`);
    }
    const [rel] = await db.select().from(relationships).where(eq(relationships.id, req.params.id));
    if (!allFeatures(rel!.features).stats) throw forbidden("stats are switched off for this dynamic");
    const members = await db.select().from(memberships).where(eq(memberships.relationshipId, req.params.id));
    const who = q.userId ?? members.find((m) => m.role === "submissive")?.userId ?? req.user.id;
    if (!members.some((m) => m.userId === who)) throw new HttpError(400, "not a member of this dynamic");

    const series = await db
      .select({ id: taskSeries.id, title: taskSeries.title, active: taskSeries.active, supersededBy: taskSeries.supersededBy })
      .from(taskSeries)
      .where(and(eq(taskSeries.relationshipId, req.params.id), eq(taskSeries.assigneeId, who)));
    // "This and following" edits split a task into a chain of series; count the chain as its newest link.
    const next = new Map(series.map((s) => [s.id, s.supersededBy]));
    const rootOf = new Map<string, string>();
    for (const s of series) {
      let id = s.id;
      for (const seen = new Set<string>(); next.get(id) && next.has(next.get(id)!) && !seen.has(id); ) {
        seen.add(id);
        id = next.get(id)!;
      }
      rootOf.set(s.id, id);
    }
    const rows = series.length
      ? await db
          .select({
            seriesId: occurrences.seriesId,
            status: occurrences.status,
            dueAt: occurrences.dueAt,
            originalDueAt: occurrences.originalDueAt,
            completedAt: occurrences.completedAt,
          })
          .from(occurrences)
          .where(
            and(
              inArray(
                occurrences.seriesId,
                series.map((s) => s.id),
              ),
              inArray(occurrences.status, ["completed", "missed", "excused"]),
            ),
          )
          .orderBy(asc(occurrences.dueAt))
      : [];

    const today = localDate(deps.now(), q.zone);
    const from = addDays(today, -(q.days - 1));
    const prevFrom = addDays(from, -q.days);
    const end = dueInstant(today, null, q.zone);
    const dated = rows.filter((r) => r.dueAt <= end).map((r) => ({ ...r, date: localDate(r.dueAt, q.zone) }));
    const inRange = dated.filter((r) => r.date >= from);

    const bucket: DynamicStats["bucket"] = q.days <= 31 ? "day" : q.days <= 92 ? "week" : "month";
    const starts = bucketStarts(from, today, bucket, req.user.weekStart === "mon" ? "mon" : "sun");
    const buckets = starts.map((start, i) => ({ start, ...tally(inRange.filter((r) => r.date >= start && (i + 1 === starts.length || r.date < starts[i + 1]!))) }));

    const byTask = new Map<string, typeof dated>();
    for (const r of dated) {
      const t = rootOf.get(r.seriesId)!;
      byTask.set(t, [...(byTask.get(t) ?? []), r]);
    }
    const tasks = series
      .filter((s) => rootOf.get(s.id) === s.id)
      .map((s) => {
        const all = byTask.get(s.id) ?? [];
        return { taskId: s.id, title: s.title, active: s.active, streak: taskStats(all).streak, ...tally(all.filter((r) => r.date >= from)) };
      })
      .filter((t) => t.done + t.missed + t.excused > 0)
      .sort((a, b) => b.done + b.missed - (a.done + a.missed) || a.title.localeCompare(b.title));

    return {
      days: q.days,
      totals: {
        ...tally(inRange),
        onTime: inRange.filter((r) => r.status === "completed" && r.completedAt && r.completedAt <= r.dueAt).length,
        moved: inRange.filter((r) => r.dueAt.getTime() !== r.originalDueAt.getTime()).length,
      },
      previous: tally(dated.filter((r) => r.date >= prevFrom && r.date < from)),
      bucket,
      buckets,
      weekdays: [0, 1, 2, 3, 4, 5, 6].map((d) => tally(inRange.filter((r) => weekday(r.date) === d))),
      tasks,
    };
  });
};
