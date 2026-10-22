import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { adjustPoints, markRedeemedInput, redeemInput } from "@obey/contracts";
import type { Deps } from "../app.js";
import { occurrences, pointsLedger, rewards, taskSeries } from "../db/schema.js";
import { HttpError, notFound } from "../errors.js";
import { ledgerDto } from "../serialize.js";
import { managers, membership, requireManager, requireMember } from "../services/access.js";
import { editOccurrence, pointsEnabled } from "../services/scheduling.js";
import { sendWithWords } from "../notify.js";
import { lockTimeForReward } from "../services/chastity.js";

export const pointsRoutes = (deps: Deps) => async (app: FastifyInstance) => {
  const { db } = deps;

  app.get<{ Params: { id: string } }>("/relationships/:id/ledger", async (req) => {
    await requireMember(db, req.params.id, req.user.id);
    const rows = await db
      .select({ l: pointsLedger, title: taskSeries.title })
      .from(pointsLedger)
      .leftJoin(occurrences, eq(pointsLedger.occurrenceId, occurrences.id))
      .leftJoin(taskSeries, eq(occurrences.seriesId, taskSeries.id))
      .where(eq(pointsLedger.relationshipId, req.params.id))
      .orderBy(desc(pointsLedger.createdAt))
      .limit(500);
    return rows.map((r) => ledgerDto(r.l, r.title));
  });

  app.get<{ Params: { id: string } }>("/relationships/:id/balances", async (req) => {
    await requireMember(db, req.params.id, req.user.id);
    return db
      .select({ userId: pointsLedger.userId, balance: sql<number>`coalesce(sum(${pointsLedger.delta}), 0)::int` })
      .from(pointsLedger)
      .where(eq(pointsLedger.relationshipId, req.params.id))
      .groupBy(pointsLedger.userId);
  });

  app.post<{ Params: { id: string } }>("/relationships/:id/ledger/adjust", async (req, reply) => {
    await requireManager(db, req.params.id, req.user.id);
    const body = adjustPoints.parse(req.body);
    if (!(await pointsEnabled(db, req.params.id))) throw new HttpError(409, "points are switched off for this relationship");
    if (!(await membership(db, req.params.id, body.userId))) throw new HttpError(400, "user is not in this relationship");
    const [row] = await db
      .insert(pointsLedger)
      .values({ relationshipId: req.params.id, userId: body.userId, delta: body.delta, kind: "adjustment", note: body.note, createdBy: req.user.id })
      .returning();
    reply.status(201);
    return ledgerDto(row!);
  });

  // Spends points on a reward straight away; the points are the sub's to spend. The redemption then waits on a Dominant
  // to honour it and mark it redeemed.
  app.post<{ Params: { id: string } }>("/rewards/:id/redeem", async (req, reply) => {
    const body = redeemInput.parse(req.body ?? {});
    const [reward] = await db.select().from(rewards).where(eq(rewards.id, req.params.id));
    if (!reward) throw notFound();
    await requireMember(db, reward.relationshipId, req.user.id);
    if (!(await pointsEnabled(db, reward.relationshipId))) throw new HttpError(409, "points are switched off for this relationship");
    const letOff = reward.letsOff ? await consequenceToLetOff(reward.relationshipId, req.user.id, body.consequenceOccurrenceId) : null;
    const row = await db.transaction(async (tx) => {
      // Serialise redemptions per user so two taps can't overspend.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${reward.relationshipId + req.user.id}))`);
      const [{ balance }] = (await tx
        .select({ balance: sql<number>`coalesce(sum(${pointsLedger.delta}), 0)::int` })
        .from(pointsLedger)
        .where(and(eq(pointsLedger.relationshipId, reward.relationshipId), eq(pointsLedger.userId, req.user.id)))) as [{ balance: number }];
      if (balance < reward.cost) throw new HttpError(409, `not enough points (${balance} of ${reward.cost})`);
      const [entry] = await tx
        .insert(pointsLedger)
        .values({
          relationshipId: reward.relationshipId,
          userId: req.user.id,
          delta: -reward.cost,
          kind: "redemption",
          note: reward.title,
          rewardId: reward.id,
          occurrenceId: letOff?.occ.id ?? null,
          createdBy: req.user.id,
        })
        .onConflictDoNothing()
        .returning();
      if (!entry) throw new HttpError(409, "you've already spent a reward on that consequence");
      return entry;
    });
    await deps.notifier.send(await managers(db, reward.relationshipId, req.user.id), {
      title: "Fealty",
      body: `${req.user.displayName} spent points on a reward`,
      data: { type: "reward_redeemed", rewardId: reward.id },
    });
    reply.status(201);
    return ledgerDto(row);
  });

  /** A consequence of theirs, still to do or missed, that a "let off" reward can be spent on. */
  async function consequenceToLetOff(relationshipId: string, userId: string, occurrenceId: string | null | undefined) {
    if (!occurrenceId) throw new HttpError(400, "pick the consequence to get out of");
    const [row] = await db
      .select({ occ: occurrences, series: taskSeries })
      .from(occurrences)
      .innerJoin(taskSeries, eq(occurrences.seriesId, taskSeries.id))
      .where(and(eq(occurrences.id, occurrenceId), eq(taskSeries.relationshipId, relationshipId), eq(taskSeries.assigneeId, userId)));
    if (!row || (!row.series.assignedConsequenceId && !row.series.causedByOccurrenceId)) throw new HttpError(400, "that isn't one of your consequences");
    if (row.occ.status !== "pending" && row.occ.status !== "missed") throw new HttpError(409, `that consequence is ${row.occ.status}`);
    return row;
  }

  // A Dominant has honoured a redemption (the screen time given, the punishment let off), with an optional note.
  app.post<{ Params: { id: string } }>("/ledger/:id/redeemed", async (req) => {
    const body = markRedeemedInput.parse(req.body ?? {});
    const [entry] = await db.select().from(pointsLedger).where(eq(pointsLedger.id, req.params.id));
    if (!entry || entry.kind !== "redemption") throw notFound();
    const me = await requireManager(db, entry.relationshipId, req.user.id);
    if (entry.userId === req.user.id && !me.solo) throw new HttpError(403, "someone else marks your redemptions");
    const note = body.note?.trim() || null;
    const updated = await db.transaction(async (tx) => {
      const [u] = await tx
        .update(pointsLedger)
        .set({ redeemedAt: deps.now(), redeemedBy: req.user.id, redeemNote: note })
        .where(and(eq(pointsLedger.id, entry.id), isNull(pointsLedger.redeemedAt)))
        .returning();
      if (!u) throw new HttpError(409, "this was already marked redeemed");
      // A reward that lets them off a consequence excuses it now, penalty and all; one already done stays done.
      if (entry.occurrenceId) {
        const [row] = await tx
          .select({ occ: occurrences, series: taskSeries })
          .from(occurrences)
          .innerJoin(taskSeries, eq(occurrences.seriesId, taskSeries.id))
          .where(eq(occurrences.id, entry.occurrenceId));
        if (row?.occ.status === "pending")
          await tx.update(occurrences).set({ status: "excused", editedBy: req.user.id, editedAt: deps.now() }).where(eq(occurrences.id, row.occ.id));
        else if (row?.occ.status === "missed") await editOccurrence(tx, row.series, row.occ, req.user.id, { status: "excused" }, deps.now());
      }
      // A reward that takes lock time off does it now, if they're still locked.
      if (entry.rewardId) {
        const [r] = await tx.select().from(rewards).where(eq(rewards.id, entry.rewardId));
        if (r?.lockMinutes) await lockTimeForReward(tx, { ...r, lockMinutes: r.lockMinutes }, entry.userId, entry.id, req.user.id, deps.now());
      }
      return u;
    });
    const push = { title: "Fealty", body: `${req.user.displayName} redeemed your reward`, data: { type: "reward_honored", rewardId: entry.rewardId ?? "" } };
    await sendWithWords(db, deps.notifier, [entry.userId], push, note ? { ...push, body: `${push.body}: “${note}”` } : null);
    return ledgerDto(updated);
  });
};
