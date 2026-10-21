import { type MonthFocus, type MonthReview, type MonthSummary, type PastMonth, type Tally, allFeatures, monthFocusInput, monthKey, monthReviewInput } from "@obey/contracts";
import { addDays, localDate } from "@obey/recurrence";
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Deps } from "../app.js";
import type { Tx } from "../db/index.js";
import { memberships, monthFocuses, monthPrompts, monthReviews, notes, occurrences, relationships, taskSeries, users } from "../db/schema.js";
import { HttpError, forbidden } from "../errors.js";
import type { Notifier } from "../notify.js";
import { canManage, requireMember } from "../services/access.js";

const zoneQuery = z.object({ zone: z.string().default("UTC") });
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const monthName = (month: string) => MONTHS[Number(month.slice(5, 7)) - 1]!;

/** The first day of the month after `month`, as a date. */
const nextMonthStart = (month: string) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
};
const previousMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};
/** The review opens on the month's third-to-last day. */
export const reviewOpensOn = (month: string) => addDays(nextMonthStart(month), -3);

function zoneOf(zone: string) {
  try {
    localDate(new Date(), zone);
    return zone;
  } catch {
    throw new HttpError(400, `unknown timezone ${zone}`);
  }
}

function tally(statuses: string[]): Tally {
  const done = statuses.filter((s) => s === "completed").length;
  const missed = statuses.filter((s) => s === "missed").length;
  return { done, missed, excused: statuses.length - done - missed, rate: done + missed ? done / (done + missed) : null };
}

const average = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

const focusDto = (f: typeof monthFocuses.$inferSelect): MonthFocus => ({ goal: f.goal, taskIds: f.taskIds, setBy: f.setBy, updatedAt: f.updatedAt.toISOString() });
const reviewDto = (r: typeof monthReviews.$inferSelect): MonthReview => ({
  userId: r.userId,
  rating: r.rating,
  wentWell: r.wentWell,
  workOn: r.workOn,
  updatedAt: r.updatedAt.toISOString(),
});

/** How the subject's finished tasks went in each of `months`, by local due date in `zone`, plus each task chain's counts. */
async function results(db: Tx, relationshipId: string, subjectId: string, months: string[], zone: string) {
  const series = await db
    .select({ id: taskSeries.id, title: taskSeries.title, supersededBy: taskSeries.supersededBy })
    .from(taskSeries)
    .where(and(eq(taskSeries.relationshipId, relationshipId), eq(taskSeries.assigneeId, subjectId)));
  // "This and following" edits split a task into a chain; a focus names the newest link, so count the whole chain as it.
  const next = new Map(series.map((s) => [s.id, s.supersededBy]));
  const chainOf = (id: string) => {
    for (const seen = new Set<string>(); next.get(id) && next.has(next.get(id)!) && !seen.has(id); ) {
      seen.add(id);
      id = next.get(id)!;
    }
    return id;
  };
  const sorted = [...months].sort();
  const from = new Date(`${addDays(`${sorted[0]}-01`, -1)}T00:00:00Z`);
  const to = new Date(`${addDays(nextMonthStart(sorted.at(-1)!), 1)}T00:00:00Z`);
  const rows = series.length
    ? await db
        .select({ seriesId: occurrences.seriesId, status: occurrences.status, dueAt: occurrences.dueAt })
        .from(occurrences)
        .where(
          and(
            inArray(
              occurrences.seriesId,
              series.map((s) => s.id),
            ),
            inArray(occurrences.status, ["completed", "missed", "excused"]),
            gte(occurrences.dueAt, from),
            lt(occurrences.dueAt, to),
          ),
        )
    : [];
  const dated = rows.map((r) => ({ ...r, month: localDate(r.dueAt, zone).slice(0, 7), task: chainOf(r.seriesId) }));
  return {
    titles: new Map(series.map((s) => [s.id, s.title])),
    of: (month: string, taskId?: string) => tally(dated.filter((r) => r.month === month && (!taskId || r.task === taskId)).map((r) => r.status)),
  };
}

/** The subject's moods in `month`: check-ins and their shared journal entries. */
async function moodIn(db: Tx, relationshipId: string, subjectId: string, month: string, zone: string) {
  const from = new Date(`${addDays(`${month}-01`, -1)}T00:00:00Z`);
  const to = new Date(`${addDays(nextMonthStart(month), 1)}T00:00:00Z`);
  const checkins = await db
    .select({ mood: occurrences.mood, at: occurrences.completedAt })
    .from(occurrences)
    .innerJoin(taskSeries, eq(occurrences.seriesId, taskSeries.id))
    .where(
      and(
        eq(taskSeries.relationshipId, relationshipId),
        eq(taskSeries.assigneeId, subjectId),
        sql`${occurrences.mood} is not null`,
        gte(occurrences.completedAt, from),
        lt(occurrences.completedAt, to),
      ),
    );
  const journal = await db
    .select({ mood: notes.mood, at: notes.createdAt })
    .from(notes)
    .where(
      and(
        eq(notes.relationshipId, relationshipId),
        eq(notes.authorId, subjectId),
        eq(notes.kind, "journal"),
        eq(notes.visibility, "shared"),
        sql`${notes.mood} is not null`,
        gte(notes.createdAt, from),
        lt(notes.createdAt, to),
      ),
    );
  return average([...checkins, ...journal].filter((r) => r.at && localDate(r.at, zone).startsWith(month)).map((r) => r.mood!));
}

/**
 * The monthly review. A Dominant sets a focus for the month and the tasks that count towards it; in the month's last
 * three days (and any time after) each person looks back on it. Nobody sees the others' answers before giving their own.
 */
export const monthRoutes = (deps: Deps) => async (app: FastifyInstance) => {
  const { db, notifier } = deps;

  async function load(relationshipId: string, userId: string) {
    const me = await requireMember(db, relationshipId, userId);
    const [rel] = await db.select().from(relationships).where(eq(relationships.id, relationshipId));
    if (!allFeatures(rel!.features).review) throw forbidden("the monthly review is switched off for this dynamic");
    const members = await db.select().from(memberships).where(eq(memberships.relationshipId, relationshipId));
    const subjectId = members.find((m) => m.role === "submissive")?.userId ?? members.find((m) => m.role === "switch" && m.userId !== userId)?.userId ?? null;
    return { me, members, subjectId };
  }

  app.get<{ Params: { id: string; month: string } }>("/relationships/:id/months/:month", async (req): Promise<MonthSummary> => {
    const month = monthKey.parse(req.params.month);
    const zone = zoneOf(zoneQuery.parse(req.query).zone);
    const { members, subjectId } = await load(req.params.id, req.user.id);
    const [focus] = await db
      .select()
      .from(monthFocuses)
      .where(and(eq(monthFocuses.relationshipId, req.params.id), eq(monthFocuses.month, month)));
    const reviews = await db
      .select()
      .from(monthReviews)
      .where(and(eq(monthReviews.relationshipId, req.params.id), eq(monthReviews.month, month)));
    const answered = reviews.some((r) => r.userId === req.user.id);
    const prev = previousMonth(month);
    const r = subjectId ? await results(db, req.params.id, subjectId, [prev, month], zone) : null;
    const empty = tally([]);
    const opensOn = reviewOpensOn(month);
    return {
      month,
      subjectId,
      focus: focus ? focusDto(focus) : null,
      reviewOpensOn: opensOn,
      reviewOpen: localDate(deps.now(), zone) >= opensOn,
      reviews: reviews.filter((x) => answered || x.userId === req.user.id).map(reviewDto),
      waitingOn: members.map((m) => m.userId).filter((id) => !reviews.some((x) => x.userId === id)),
      totals: r?.of(month) ?? empty,
      previous: r?.of(prev) ?? empty,
      focusTasks: r && focus ? focus.taskIds.map((taskId) => ({ taskId, title: r.titles.get(taskId) ?? "A task", ...r.of(month, taskId) })) : [],
      mood: subjectId ? await moodIn(db, req.params.id, subjectId, month, zone) : null,
      previousMood: subjectId ? await moodIn(db, req.params.id, subjectId, prev, zone) : null,
    };
  });

  /** Months before this one that had a focus or a review, newest first. */
  app.get<{ Params: { id: string } }>("/relationships/:id/months", async (req): Promise<PastMonth[]> => {
    const zone = zoneOf(zoneQuery.parse(req.query).zone);
    const { subjectId } = await load(req.params.id, req.user.id);
    const current = localDate(deps.now(), zone).slice(0, 7);
    const focuses = await db
      .select()
      .from(monthFocuses)
      .where(and(eq(monthFocuses.relationshipId, req.params.id), lt(monthFocuses.month, current)));
    const reviews = await db
      .select()
      .from(monthReviews)
      .where(and(eq(monthReviews.relationshipId, req.params.id), lt(monthReviews.month, current)));
    const months = [...new Set([...focuses.map((f) => f.month), ...reviews.map((r) => r.month)])].sort().reverse().slice(0, 24);
    if (!months.length) return [];
    const r = subjectId ? await results(db, req.params.id, subjectId, months, zone) : null;
    return months.map((month) => ({
      month,
      goal: focuses.find((f) => f.month === month)?.goal ?? null,
      myRating: reviews.find((x) => x.month === month && x.userId === req.user.id)?.rating ?? null,
      rate: r?.of(month).rate ?? null,
    }));
  });

  app.put<{ Params: { id: string; month: string } }>("/relationships/:id/months/:month/focus", async (req): Promise<MonthFocus> => {
    const month = monthKey.parse(req.params.month);
    const body = monthFocusInput.parse(req.body);
    const { me } = await load(req.params.id, req.user.id);
    if (!canManage(me.role)) throw forbidden("only a Dominant sets the month's focus");
    if (body.taskIds.length) {
      const found = await db
        .select({ id: taskSeries.id })
        .from(taskSeries)
        .where(and(eq(taskSeries.relationshipId, req.params.id), inArray(taskSeries.id, body.taskIds)));
      if (found.length !== new Set(body.taskIds).size) throw new HttpError(400, "a focus task isn't in this dynamic");
    }
    const values = { goal: body.goal, taskIds: [...new Set(body.taskIds)], setBy: req.user.id, updatedAt: deps.now() };
    const [row] = await db
      .insert(monthFocuses)
      .values({ relationshipId: req.params.id, month, ...values })
      .onConflictDoUpdate({ target: [monthFocuses.relationshipId, monthFocuses.month], set: values })
      .returning();
    return focusDto(row!);
  });

  app.put<{ Params: { id: string; month: string } }>("/relationships/:id/months/:month/review", async (req): Promise<MonthReview> => {
    const month = monthKey.parse(req.params.month);
    const zone = zoneOf(zoneQuery.parse(req.query).zone);
    const body = monthReviewInput.parse(req.body);
    const { members } = await load(req.params.id, req.user.id);
    if (localDate(deps.now(), zone) < reviewOpensOn(month)) throw new HttpError(409, `the review opens on ${reviewOpensOn(month)}`);
    const values = { ...body, updatedAt: deps.now() };
    const [before] = await db
      .select({ userId: monthReviews.userId })
      .from(monthReviews)
      .where(and(eq(monthReviews.relationshipId, req.params.id), eq(monthReviews.month, month), eq(monthReviews.userId, req.user.id)));
    const [row] = await db
      .insert(monthReviews)
      .values({ relationshipId: req.params.id, month, userId: req.user.id, ...values })
      .onConflictDoUpdate({ target: [monthReviews.relationshipId, monthReviews.month, monthReviews.userId], set: values })
      .returning();
    if (!before)
      await notifier.send(
        members.map((m) => m.userId).filter((id) => id !== req.user.id),
        { title: "Fealty", body: `${req.user.displayName} looked back on ${monthName(month)}`, data: { type: "month_review", month } },
      );
    return reviewDto(row!);
  });
};

/** Tells each person in a dynamic with the review on that their month's review has opened, once per month. */
export async function promptMonthReviews(db: Tx, notifier: Notifier, now: Date) {
  // Only the last few days of a month can open a review anywhere in the world; skip the query the rest of the time.
  if (addDays(localDate(now, "UTC"), 4).slice(0, 7) === localDate(now, "UTC").slice(0, 7)) return 0;
  const rows = await db
    .select({ relationshipId: memberships.relationshipId, userId: memberships.userId, timezone: users.timezone, features: relationships.features })
    .from(memberships)
    .innerJoin(relationships, eq(relationships.id, memberships.relationshipId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(sql`${relationships.endedAt} is null`);
  let sent = 0;
  for (const r of rows) {
    if (!allFeatures(r.features).review) continue;
    let today: string;
    try {
      today = localDate(now, r.timezone ?? "UTC");
    } catch {
      today = localDate(now, "UTC");
    }
    const month = today.slice(0, 7);
    if (today < reviewOpensOn(month)) continue;
    const [claimed] = await db.insert(monthPrompts).values({ relationshipId: r.relationshipId, month, userId: r.userId }).onConflictDoNothing().returning();
    if (!claimed) continue;
    await notifier.send([r.userId], { title: "Fealty", body: `Time to look back on ${monthName(month)}`, data: { type: "month_review_open", month } });
    sent++;
  }
  return sent;
}
