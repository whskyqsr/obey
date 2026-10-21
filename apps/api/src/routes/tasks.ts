import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  type TaskStats,
  assignConsequence,
  completeOccurrence as completeBody,
  countOccurrence as countBody,
  decideRescheduleInput,
  editOccurrence as editBody,
  plainDate,
  planRescheduleInput,
  rescheduleDayInput,
  rescheduleInput,
  reviewOccurrence as reviewBody,
  taskInput,
  tickStep as tickStepBody,
} from "@obey/contracts";
import { addDays, dueInstant, localDate } from "@obey/recurrence";
import type { Deps } from "../app.js";
import type { Tx } from "../db/index.js";
import { consequences, notes, occurrences, places, pointsLedger, relationships, reschedules, taskSeries } from "../db/schema.js";
import { HttpError, forbidden, notFound, parsePatch } from "../errors.js";
import { occurrenceDto, rescheduleDto, taskDto } from "../serialize.js";
import { addComment } from "./comments.js";
import { canManage, managers, membership, requireManager, requireMember } from "../services/access.js";
import {
  completeOccurrence,
  countOccurrence,
  decideReschedule,
  isCountTask,
  editOccurrence,
  issueConsequence,
  requestGroupReschedule,
  requestPlanReschedule,
  materializeRelationship,
  materializeSeries,
  requestReschedule,
  reviewOccurrence,
  tickStep,
  undoCompletion,
} from "../services/scheduling.js";

const MAX_RANGE_DAYS = 62;
const STREAK_RECENT = 7;

function validZone(zone: string) {
  try {
    dueInstant("2026-01-01", null, zone);
  } catch {
    throw new HttpError(400, `unknown timezone ${zone}`);
  }
}

export async function loadOccurrence(db: Tx, id: string, userId: string) {
  const [row] = await db
    .select({ occ: occurrences, series: taskSeries })
    .from(occurrences)
    .innerJoin(taskSeries, eq(occurrences.seriesId, taskSeries.id))
    .where(eq(occurrences.id, id));
  if (!row) throw notFound();
  const m = await requireMember(db, row.series.relationshipId, userId);
  const [rel] = await db.select().from(relationships).where(eq(relationships.id, row.series.relationshipId));
  return { ...row, member: m, rel: rel! };
}

/** A count task's bounds must make sense, and it's marked by counting, so it can't also take steps, a review, proof, a mood or an entry. */
function checkCount(t: {
  countMin: number | null;
  countMax: number | null;
  steps: unknown[];
  approvalRequired: boolean;
  proofRequired: boolean;
  askMood: boolean;
  asksJournal: boolean;
}) {
  if (t.countMin !== null && t.countMax !== null && t.countMin > t.countMax) throw new HttpError(400, "the minimum can't be more than the maximum");
  if (isCountTask(t) && (t.steps.length || t.approvalRequired || t.proofRequired || t.askMood || t.asksJournal))
    throw new HttpError(400, "a counted task can't also be a ritual, need approval or proof, or ask for a mood or a journal entry");
}

/** A location task is done by getting there, so it can't also be counted, a ritual, or need proof, a mood or an entry. */
async function checkPlace(
  db: Tx,
  relationshipId: string,
  t: {
    placeId: string | null;
    stayMinutes: number | null;
    countMin: number | null;
    countMax: number | null;
    steps: unknown[];
    proofRequired: boolean;
    askMood: boolean;
    asksJournal: boolean;
  },
) {
  if (!t.placeId) {
    if (t.stayMinutes !== null) throw new HttpError(400, "a stay needs a place");
    return;
  }
  const [p] = await db
    .select({ id: places.id })
    .from(places)
    .where(and(eq(places.id, t.placeId), eq(places.relationshipId, relationshipId)));
  if (!p) throw new HttpError(400, "that place isn't in this dynamic");
  if (isCountTask(t) || t.steps.length || t.proofRequired || t.askMood || t.asksJournal)
    throw new HttpError(400, "a location task can't also be counted or a ritual, need proof, or ask for a mood or a journal entry");
}

/** Rows oldest first. Excused occurrences neither count against the rate nor break a streak. */
export function taskStats(rows: { status: string; completedAt: Date | null }[]): TaskStats {
  let done = 0,
    missed = 0,
    excused = 0,
    streak = 0,
    bestStreak = 0;
  let lastDoneAt: Date | null = null;
  for (const r of rows) {
    if (r.status === "completed") {
      done++;
      streak++;
      bestStreak = Math.max(bestStreak, streak);
      if (r.completedAt && (!lastDoneAt || r.completedAt > lastDoneAt)) lastDoneAt = r.completedAt;
    } else if (r.status === "missed") {
      missed++;
      streak = 0;
    } else excused++;
  }
  return { done, missed, excused, rate: done + missed ? done / (done + missed) : null, streak, bestStreak, lastDoneAt: lastDoneAt?.toISOString() ?? null };
}

export const taskRoutes = (deps: Deps) => async (app: FastifyInstance) => {
  const { db, notifier } = deps;

  /** A task's series id plus those it replaced in "this and following" edits, after checking membership. */
  async function lineage(seriesId: string, userId: string) {
    const [series] = await db.select().from(taskSeries).where(eq(taskSeries.id, seriesId));
    if (!series) throw notFound();
    await requireMember(db, series.relationshipId, userId);
    const ids = [series.id];
    for (let frontier = [series.id]; frontier.length; ) {
      const older = await db.select({ id: taskSeries.id }).from(taskSeries).where(inArray(taskSeries.supersededBy, frontier));
      frontier = older.map((r) => r.id).filter((id) => !ids.includes(id));
      ids.push(...frontier);
    }
    return ids;
  }
  const horizon = (zone: string) => addDays(localDate(deps.now(), zone), deps.materializeDays);

  app.get<{ Params: { id: string } }>("/relationships/:id/tasks", async (req) => {
    await requireMember(db, req.params.id, req.user.id);
    const rows = await db
      .select()
      .from(taskSeries)
      .where(and(eq(taskSeries.relationshipId, req.params.id), eq(taskSeries.active, true), isNull(taskSeries.curfewUntil)))
      .orderBy(asc(taskSeries.title));
    return rows.map(taskDto);
  });

  app.post<{ Params: { id: string } }>("/relationships/:id/tasks", async (req, reply) => {
    await requireManager(db, req.params.id, req.user.id);
    const body = taskInput.parse(req.body);
    validZone(body.timezone);
    checkCount(body);
    await checkPlace(db, req.params.id, body);
    if (!(await membership(db, req.params.id, body.assigneeId))) throw new HttpError(400, "assignee is not in this relationship");
    const series = await db.transaction(async (tx) => {
      const [s] = await tx
        .insert(taskSeries)
        .values({ ...body, relationshipId: req.params.id, createdBy: req.user.id })
        .returning();
      await materializeSeries(tx, s!, horizon(s!.timezone), deps.now());
      return s!;
    });
    if (series.assigneeId !== req.user.id)
      await notifier.send([series.assigneeId], { title: "Fealty", body: "You have a new task", data: { type: "task_assigned", taskId: series.id } });
    reply.status(201);
    return taskDto(series);
  });

  /** A consequence handed out on its own becomes a one-off task, so it's done, missed and reviewed like any other. */
  app.post<{ Params: { id: string } }>("/consequences/:id/assign", async (req, reply) => {
    const [c] = await db.select().from(consequences).where(eq(consequences.id, req.params.id));
    if (!c) throw notFound();
    await requireManager(db, c.relationshipId, req.user.id);
    const body = assignConsequence.parse(req.body);
    validZone(body.timezone);
    if (!(await membership(db, c.relationshipId, body.assigneeId))) throw new HttpError(400, "assignee is not in this relationship");
    const series = (await db.transaction((tx) => issueConsequence(tx, c, { ...body, createdBy: req.user.id }, deps.now())))!;
    if (series.assigneeId !== req.user.id)
      await notifier.send([series.assigneeId], { title: "Fealty", body: "You've been given a consequence", data: { type: "task_assigned", taskId: series.id } });
    reply.status(201);
    return taskDto(series);
  });

  app.patch<{ Params: { id: string } }>("/tasks/:id", async (req) => {
    const [series] = await db.select().from(taskSeries).where(eq(taskSeries.id, req.params.id));
    if (!series) throw notFound();
    await requireManager(db, series.relationshipId, req.user.id);
    if (series.curfewUntil) throw new HttpError(409, "change the curfew from Your dynamic");
    const body = parsePatch(taskInput.partial(), req.body);
    if (body.timezone) validZone(body.timezone);
    checkCount({ ...series, ...body });
    await checkPlace(db, series.relationshipId, { ...series, ...body });
    if (body.assigneeId && !(await membership(db, series.relationshipId, body.assigneeId))) throw new HttpError(400, "assignee is not in this relationship");
    const timingChanged = body.schedule !== undefined || body.dueTime !== undefined || body.timezone !== undefined;
    const updated = await db.transaction(async (tx) => {
      const [s] = await tx
        .update(taskSeries)
        .set({ ...body, updatedAt: deps.now() })
        .where(eq(taskSeries.id, series.id))
        .returning();
      if (timingChanged) {
        // Regenerate untouched future occurrences; ones already moved by a reschedule keep their new deadline.
        const future = await tx
          .select()
          .from(occurrences)
          .where(and(eq(occurrences.seriesId, s!.id), eq(occurrences.status, "pending"), gte(occurrences.dueAt, deps.now())));
        const untouched = future.filter((o) => o.dueAt.getTime() === o.originalDueAt.getTime()).map((o) => o.id);
        if (untouched.length) await tx.delete(occurrences).where(inArray(occurrences.id, untouched));
        await materializeSeries(tx, s!, horizon(s!.timezone), deps.now());
      }
      return s!;
    });
    return taskDto(updated);
  });

  app.delete<{ Params: { id: string } }>("/tasks/:id", async (req, reply) => {
    const [series] = await db.select().from(taskSeries).where(eq(taskSeries.id, req.params.id));
    if (!series) throw notFound();
    await requireManager(db, series.relationshipId, req.user.id);
    if (series.curfewUntil) throw new HttpError(409, "turn the curfew off from Your dynamic");
    await db.transaction(async (tx) => {
      await tx.update(taskSeries).set({ active: false, updatedAt: deps.now() }).where(eq(taskSeries.id, series.id));
      await tx
        .update(occurrences)
        .set({ status: "cancelled" })
        .where(and(eq(occurrences.seriesId, series.id), eq(occurrences.status, "pending")));
    });
    reply.status(204);
  });

  // Curfew nights aren't tasks, so lists leave them out; the phone asks for them to watch Home.
  app.get<{ Params: { id: string }; Querystring: { from?: string; to?: string; curfew?: string } }>("/relationships/:id/occurrences", async (req) => {
    await requireMember(db, req.params.id, req.user.id);
    const q = z.object({ from: plainDate, to: plainDate, curfew: z.enum(["include"]).optional() }).parse(req.query);
    const span = (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000;
    if (span < 0 || span > MAX_RANGE_DAYS) throw new HttpError(400, `range must be 0..${MAX_RANGE_DAYS} days`);
    await materializeRelationship(db, req.params.id, q.to, deps.now());
    // Pad by a day each side: due instants are compared in UTC but dates are local to each series.
    const rows = await db
      .select({ occ: occurrences, series: taskSeries })
      .from(occurrences)
      .innerJoin(taskSeries, eq(occurrences.seriesId, taskSeries.id))
      .where(
        and(
          eq(taskSeries.relationshipId, req.params.id),
          gte(occurrences.dueAt, new Date(Date.parse(q.from) - 86_400_000)),
          lte(occurrences.dueAt, new Date(Date.parse(q.to) + 2 * 86_400_000)),
        ),
      )
      .orderBy(asc(occurrences.dueAt));
    return rows
      .filter(({ occ, series }) => {
        const d = localDate(occ.dueAt, series.timezone);
        return d >= q.from && d <= q.to && occ.status !== "cancelled" && (q.curfew === "include" || !series.curfewUntil);
      })
      .map(({ occ, series }) => occurrenceDto(occ, series));
  });

  /** Finished occurrences of a task, newest first, including those from before a "this and following" split. */
  app.get<{ Params: { id: string }; Querystring: { before?: string; limit?: string } }>("/tasks/:id/history", async (req) => {
    const q = z.object({ before: z.string().datetime({ offset: true }).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(req.query);
    const ids = await lineage(req.params.id, req.user.id);
    const rows = await db
      .select({
        occ: occurrences,
        series: taskSeries,
        pointsDelta: sql<number>`coalesce((select sum(${pointsLedger.delta}) from ${pointsLedger} where ${pointsLedger.occurrenceId} = ${occurrences.id} and ${pointsLedger.kind} in ('completion', 'miss')), 0)::int`,
      })
      .from(occurrences)
      .innerJoin(taskSeries, eq(occurrences.seriesId, taskSeries.id))
      .where(
        and(
          inArray(occurrences.seriesId, ids),
          or(inArray(occurrences.status, ["submitted", "completed", "missed", "excused"]), eq(occurrences.calledOff, true)),
          q.before ? lt(occurrences.dueAt, new Date(q.before)) : undefined,
        ),
      )
      .orderBy(desc(occurrences.dueAt))
      .limit(q.limit);
    return rows.map(({ occ, series: s, pointsDelta }) => ({
      ...occurrenceDto(occ, s),
      pointsDelta,
      editedBy: occ.editedBy,
      editedAt: occ.editedAt?.toISOString() ?? null,
    }));
  });

  /** Each active task's streak and last few results, for the strips on task cards. Follows "this and following" splits like stats. */
  /** The mood graph: check-in answers (both see them) and journal moods the viewer may read, oldest first. */
  app.get<{ Params: { id: string }; Querystring: { days?: string } }>("/relationships/:id/moods", async (req) => {
    await requireMember(db, req.params.id, req.user.id);
    const days = z.coerce.number().int().min(1).max(366).default(30).parse(req.query.days);
    const since = new Date(deps.now().getTime() - days * 86_400_000);
    const checkins = await db
      .select({ occ: occurrences, title: taskSeries.title, assigneeId: taskSeries.assigneeId })
      .from(occurrences)
      .innerJoin(taskSeries, eq(occurrences.seriesId, taskSeries.id))
      .where(and(eq(taskSeries.relationshipId, req.params.id), sql`${occurrences.mood} is not null`, gte(occurrences.completedAt, since)));
    const journal = await db
      .select()
      .from(notes)
      .where(
        and(
          eq(notes.relationshipId, req.params.id),
          eq(notes.kind, "journal"),
          sql`${notes.mood} is not null`,
          gte(notes.createdAt, since),
          or(eq(notes.visibility, "shared"), eq(notes.authorId, req.user.id)),
        ),
      );
    return [
      ...checkins.map(({ occ, title, assigneeId }) => ({
        at: occ.completedAt!.toISOString(),
        userId: assigneeId,
        mood: occ.mood!,
        source: "checkin" as const,
        title,
        note: occ.noteMd,
        occurrenceId: occ.id,
        noteId: null,
      })),
      ...journal.map((n) => ({
        at: n.createdAt.toISOString(),
        userId: n.authorId,
        mood: n.mood!,
        source: "journal" as const,
        title: n.title,
        note: null,
        occurrenceId: null,
        noteId: n.id,
      })),
    ].sort((a, b) => a.at.localeCompare(b.at));
  });

  app.get<{ Params: { id: string } }>("/relationships/:id/streaks", async (req) => {
    await requireMember(db, req.params.id, req.user.id);
    const series = await db
      .select({ id: taskSeries.id, active: taskSeries.active, supersededBy: taskSeries.supersededBy })
      .from(taskSeries)
      .where(and(eq(taskSeries.relationshipId, req.params.id), isNull(taskSeries.curfewUntil)));
    const rootOf = new Map<string, string>();
    const next = new Map(series.map((s) => [s.id, s.supersededBy]));
    for (const s of series) {
      let id = s.id;
      for (const seen = new Set<string>(); next.get(id) && !seen.has(id); ) {
        seen.add(id);
        id = next.get(id)!;
      }
      rootOf.set(s.id, id);
    }
    const rows = await db
      .select({ seriesId: occurrences.seriesId, status: occurrences.status, completedAt: occurrences.completedAt })
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
      .orderBy(asc(occurrences.dueAt));
    const byTask = new Map<string, typeof rows>();
    for (const r of rows) {
      const t = rootOf.get(r.seriesId)!;
      byTask.set(t, [...(byTask.get(t) ?? []), r]);
    }
    return series
      .filter((s) => s.active)
      .map((s) => {
        const list = byTask.get(s.id) ?? [];
        return { taskId: s.id, streak: taskStats(list).streak, recent: list.slice(-STREAK_RECENT).map((r) => r.status as "completed" | "missed" | "excused") };
      });
  });

  /** Completion counts and streaks over a task's whole history. */
  app.get<{ Params: { id: string } }>("/tasks/:id/stats", async (req) => {
    const ids = await lineage(req.params.id, req.user.id);
    const rows = await db
      .select({ status: occurrences.status, completedAt: occurrences.completedAt })
      .from(occurrences)
      .where(and(inArray(occurrences.seriesId, ids), inArray(occurrences.status, ["completed", "missed", "excused"])))
      .orderBy(asc(occurrences.dueAt));
    return taskStats(rows);
  });

  app.patch<{ Params: { id: string } }>("/occurrences/:id", async (req) => {
    const body = editBody.parse(req.body);
    const { occ, series, member } = await loadOccurrence(db, req.params.id, req.user.id);
    if (!canManage(member.role)) throw forbidden("only a Dominant can edit history");
    const updated = await db.transaction((tx) =>
      editOccurrence(
        tx,
        series,
        occ,
        req.user.id,
        { status: body.status, completedAt: body.completedAt ? new Date(body.completedAt) : undefined, noteMd: body.noteMd },
        deps.now(),
      ),
    );
    if (updated.status !== occ.status && series.assigneeId !== req.user.id) {
      await notifier.send([series.assigneeId], {
        title: "Fealty",
        body: `${req.user.displayName} updated your task history`,
        data: { type: "occurrence_edited", occurrenceId: occ.id },
      });
    }
    return occurrenceDto(updated, series);
  });

  app.post<{ Params: { id: string } }>("/occurrences/:id/undo", async (req) => {
    const { occ, series, member } = await loadOccurrence(db, req.params.id, req.user.id);
    const updated = await db.transaction((tx) => undoCompletion(tx, series, occ, { userId: req.user.id, role: member.role }, deps.now()));
    return occurrenceDto(updated, series);
  });

  app.post<{ Params: { id: string } }>("/occurrences/:id/complete", async (req) => {
    const body = completeBody.parse(req.body ?? {});
    const { occ, series, member } = await loadOccurrence(db, req.params.id, req.user.id);
    const updated = await db.transaction((tx) =>
      completeOccurrence(
        tx,
        series,
        occ,
        { userId: req.user.id, role: member.role },
        body.noteMd,
        deps.now(),
        body.mood,
        body.journal,
        body.doneAt ? new Date(body.doneAt) : undefined,
      ),
    );
    if (req.user.id === series.assigneeId) {
      const submitted = updated.status === "submitted";
      await notifier.send(await managers(db, series.relationshipId, req.user.id), {
        title: "Fealty",
        body: submitted ? `${req.user.displayName} submitted a task for review` : `${req.user.displayName} completed a task`,
        data: { type: submitted ? "occurrence_submitted" : "occurrence_completed", occurrenceId: occ.id },
      });
    }
    return occurrenceDto(updated, series);
  });

  app.post<{ Params: { id: string } }>("/occurrences/:id/count", async (req) => {
    const body = countBody.parse(req.body);
    const { occ, series, member } = await loadOccurrence(db, req.params.id, req.user.id);
    const updated = await db.transaction((tx) => countOccurrence(tx, series, occ, { userId: req.user.id, role: member.role }, body, deps.now()));
    if (req.user.id === series.assigneeId && occ.status !== updated.status && (updated.status === "completed" || updated.status === "missed"))
      await notifier.send(await managers(db, series.relationshipId, req.user.id), {
        title: "Fealty",
        body: updated.status === "completed" ? `${req.user.displayName} completed a task` : `${req.user.displayName} went over on “${series.title}”`,
        data: { type: updated.status === "completed" ? "occurrence_completed" : "occurrence_missed", occurrenceId: occ.id },
      });
    return occurrenceDto(updated, series);
  });

  app.post<{ Params: { id: string } }>("/occurrences/:id/steps", async (req) => {
    const body = tickStepBody.parse(req.body);
    const { occ, series } = await loadOccurrence(db, req.params.id, req.user.id);
    const updated = await tickStep(db, series, occ, req.user.id, body.stepId, body.done, deps.now());
    return occurrenceDto(updated, series);
  });

  // A Dominant leaves a miss as missed: it keeps its status and penalty and stops asking for a decision.
  app.post<{ Params: { id: string } }>("/occurrences/:id/confirm-miss", async (req) => {
    const { occ, series, member } = await loadOccurrence(db, req.params.id, req.user.id);
    if (!canManage(member.role) || req.user.id === series.assigneeId) throw forbidden("only a Dominant can do this");
    if (occ.status !== "missed") throw new HttpError(409, `occurrence is ${occ.status}`);
    const [updated] = await db.update(occurrences).set({ missConfirmedAt: deps.now() }).where(eq(occurrences.id, occ.id)).returning();
    return occurrenceDto(updated!, series);
  });

  app.post<{ Params: { id: string } }>("/occurrences/:id/review", async (req) => {
    const body = reviewBody.parse(req.body);
    const { occ, series, member } = await loadOccurrence(db, req.params.id, req.user.id);
    if (!canManage(member.role) || req.user.id === series.assigneeId) throw forbidden("only a Dominant can review this");
    if (body.noteMd !== undefined) await db.update(occurrences).set({ noteMd: body.noteMd }).where(eq(occurrences.id, occ.id));
    const updated = await db.transaction(async (tx) => {
      const reviewed = await reviewOccurrence(tx, series, occ, req.user.id, body.approve);
      if (body.comment) {
        await addComment(tx, occ.id, req.user.id, body.comment);
        return { ...reviewed, commentCount: reviewed.commentCount + 1 };
      }
      return reviewed;
    });
    await notifier.send([series.assigneeId], {
      title: "Fealty",
      body: body.approve ? "Your task was approved" : "Your task needs another try",
      data: { type: "occurrence_reviewed", occurrenceId: occ.id },
    });
    return occurrenceDto(updated, series);
  });

  app.post<{ Params: { id: string } }>("/occurrences/:id/reschedule", async (req) => {
    const change = rescheduleInput.parse(req.body);
    const { occ, series, member, rel } = await loadOccurrence(db, req.params.id, req.user.id);
    const result = await db.transaction((tx) => requestReschedule(tx, rel, series, occ, { userId: req.user.id, role: member.role }, change, deps.now(), deps.materializeDays));
    const [current] = await db.select().from(taskSeries).where(eq(taskSeries.id, result.occurrence.seriesId));
    if (!result.applied) {
      await notifier.send(await managers(db, rel.id, req.user.id), {
        title: "Fealty",
        body: `${req.user.displayName} asked for more time`,
        data: { type: "reschedule_requested", requestId: result.request.id },
      });
    } else if (req.user.id !== series.assigneeId) {
      await notifier.send([series.assigneeId], { title: "Fealty", body: "A deadline changed", data: { type: "rescheduled", occurrenceId: result.occurrence.id } });
    }
    return {
      applied: result.applied,
      request: rescheduleDto(result.request, current!.title),
      occurrence: occurrenceDto(result.occurrence, current!),
    };
  });

  // "More time for the whole day": one request covering several of the actor's occurrences.
  app.post<{ Params: { id: string } }>("/relationships/:id/reschedules/day", async (req) => {
    const body = rescheduleDayInput.parse(req.body);
    const m = await requireMember(db, req.params.id, req.user.id);
    const [rel] = await db.select().from(relationships).where(eq(relationships.id, req.params.id));
    const items = await db
      .select({ occ: occurrences, series: taskSeries })
      .from(occurrences)
      .innerJoin(taskSeries, eq(occurrences.seriesId, taskSeries.id))
      .where(and(inArray(occurrences.id, body.occurrenceIds), eq(taskSeries.relationshipId, req.params.id)));
    if (items.length !== new Set(body.occurrenceIds).size) throw notFound("some tasks were not found");
    const result = await db.transaction((tx) =>
      requestGroupReschedule(tx, rel!, items, { userId: req.user.id, role: m.role }, body.delayHours, body.reason, deps.now(), deps.materializeDays),
    );
    const titles = new Map(items.map((i) => [i.occ.id, i.series.title]));
    const series = new Map(items.map((i) => [i.series.id, i.series]));
    if (!result.applied) {
      await notifier.send(await managers(db, rel!.id, req.user.id), {
        title: "Fealty",
        body: `${req.user.displayName} asked for more time on ${items.length} tasks`,
        data: { type: "reschedule_requested", groupId: result.groupId },
      });
    }
    return {
      applied: result.applied,
      groupId: result.groupId,
      requests: result.requests.map((r) => rescheduleDto(r, titles.get(r.occurrenceId)!)),
      occurrences: result.occurrences.map((o) => occurrenceDto(o, series.get(o.seriesId)!)),
    };
  });

  // Sorting out the tasks a plan runs into: each moved or called off.
  app.post<{ Params: { id: string } }>("/relationships/:id/reschedules/plan", async (req) => {
    const body = planRescheduleInput.parse(req.body);
    const m = await requireMember(db, req.params.id, req.user.id);
    const [rel] = await db.select().from(relationships).where(eq(relationships.id, req.params.id));
    const ids = body.items.map((i) => i.occurrenceId);
    if (new Set(ids).size !== ids.length) throw new HttpError(400, "each task once");
    const rows = await db
      .select({ occ: occurrences, series: taskSeries })
      .from(occurrences)
      .innerJoin(taskSeries, eq(occurrences.seriesId, taskSeries.id))
      .where(and(inArray(occurrences.id, ids), eq(taskSeries.relationshipId, req.params.id)));
    if (rows.length !== ids.length) throw notFound("some tasks were not found");
    const byId = new Map(rows.map((r) => [r.occ.id, r]));
    const items = body.items.map((i) => ({ ...byId.get(i.occurrenceId)!, action: i.action, dueAt: i.dueAt ? new Date(i.dueAt) : undefined }));
    const result = await db.transaction((tx) => requestPlanReschedule(tx, rel!, items, { userId: req.user.id, role: m.role }, body.reason, deps.now(), deps.materializeDays));
    const titles = new Map(rows.map((r) => [r.occ.id, r.series.title]));
    const series = new Map(rows.map((r) => [r.series.id, r.series]));
    if (result.asked) {
      await notifier.send(await managers(db, rel!.id, req.user.id), {
        title: "Fealty",
        body: `${req.user.displayName} asked about ${result.asked === 1 ? "a task that clashes" : `${result.asked} tasks that clash`} with a plan`,
        data: { type: "reschedule_requested", groupId: result.groupId },
      });
    }
    const changedFor = [...new Set(items.filter((it, i) => result.requests[i]!.status === "applied" && it.series.assigneeId !== req.user.id).map((it) => it.series.assigneeId))];
    if (changedFor.length) await notifier.send(changedFor, { title: "Fealty", body: "Some of your tasks changed around a plan", data: { type: "rescheduled" } });
    return {
      applied: result.asked === 0,
      groupId: result.groupId,
      requests: result.requests.map((r) => rescheduleDto(r, titles.get(r.occurrenceId)!)),
      occurrences: result.occurrences.map((o) => occurrenceDto(o, series.get(o.seriesId)!)),
    };
  });

  app.get<{ Params: { id: string }; Querystring: { status?: string } }>("/relationships/:id/reschedules", async (req) => {
    await requireMember(db, req.params.id, req.user.id);
    const status = z.enum(["requested", "approved", "declined", "applied"]).optional().parse(req.query.status);
    const rows = await db
      .select({ r: reschedules, title: taskSeries.title })
      .from(reschedules)
      .innerJoin(occurrences, eq(reschedules.occurrenceId, occurrences.id))
      .innerJoin(taskSeries, eq(occurrences.seriesId, taskSeries.id))
      .where(and(eq(reschedules.relationshipId, req.params.id), status ? eq(reschedules.status, status) : undefined))
      .orderBy(asc(reschedules.createdAt), asc(occurrences.dueAt));
    return rows.map(({ r, title }) => rescheduleDto(r, title));
  });

  app.post<{ Params: { id: string } }>("/reschedules/:id/decide", async (req) => {
    const { approve, dueAt, item } = decideRescheduleInput.parse(req.body);
    const [request] = await db.select().from(reschedules).where(eq(reschedules.id, req.params.id));
    if (!request) throw notFound();
    const m = await requireMember(db, request.relationshipId, req.user.id);
    if (!canManage(m.role) || request.requestedBy === req.user.id) throw forbidden("only a Dominant can decide this");
    const results = await db.transaction((tx) =>
      decideReschedule(tx, request, req.user.id, approve, deps.now(), deps.materializeDays, { dueAt: dueAt ? new Date(dueAt) : undefined, item }),
    );
    const n = results.length;
    const what = request.kind === "cancel" && n === 1 ? "request to call off a task" : `extension${n > 1 ? ` for ${n} tasks` : ""}`;
    await notifier.send([request.requestedBy], {
      title: "Fealty",
      body: dueAt && approve ? `${results[0]!.series.title} was rescheduled instead` : `Your ${what} was ${approve ? "approved" : "declined"}`,
      data: { type: "reschedule_decided", requestId: request.id },
    });
    const dtos = results.map((x) => ({ request: rescheduleDto(x.request, x.series.title), occurrence: occurrenceDto(x.occurrence, x.series) }));
    // `request`/`occurrence` describe the one that was tapped; `requests`/`occurrences` cover its whole group.
    const tapped = dtos.find((d) => d.request.id === request.id) ?? dtos[0]!;
    return { ...tapped, requests: dtos.map((d) => d.request), occurrences: dtos.map((d) => d.occurrence) };
  });
};
