import { and, desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { adjustPoints } from "@obey/contracts";
import type { Deps } from "../app.js";
import { pointsLedger, rewards } from "../db/schema.js";
import { HttpError, notFound } from "../errors.js";
import { ledgerDto } from "../serialize.js";
import { managers, membership, requireManager, requireMember } from "../services/access.js";

export const pointsRoutes = (deps: Deps) => async (app: FastifyInstance) => {
  const { db } = deps;

  app.get<{ Params: { id: string } }>("/relationships/:id/ledger", async (req) => {
    await requireMember(db, req.params.id, req.user.id);
    const rows = await db
      .select()
      .from(pointsLedger)
      .where(eq(pointsLedger.relationshipId, req.params.id))
      .orderBy(desc(pointsLedger.createdAt))
      .limit(500);
    return rows.map(ledgerDto);
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
    if (!(await membership(db, req.params.id, body.userId))) throw new HttpError(400, "user is not in this relationship");
    const [row] = await db
      .insert(pointsLedger)
      .values({ relationshipId: req.params.id, userId: body.userId, delta: body.delta, kind: "adjustment", note: body.note, createdBy: req.user.id })
      .returning();
    reply.status(201);
    return ledgerDto(row!);
  });

  // Spends points on a reward. The Dominant is notified; reward approval flow is a later addition.
  app.post<{ Params: { id: string } }>("/rewards/:id/redeem", async (req, reply) => {
    const [reward] = await db.select().from(rewards).where(eq(rewards.id, req.params.id));
    if (!reward) throw notFound();
    await requireMember(db, reward.relationshipId, req.user.id);
    const row = await db.transaction(async (tx) => {
      // Serialise redemptions per user so two taps can't overspend.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${reward.relationshipId + req.user.id}))`);
      const [{ balance }] = (await tx
        .select({ balance: sql<number>`coalesce(sum(${pointsLedger.delta}), 0)::int` })
        .from(pointsLedger)
        .where(and(eq(pointsLedger.relationshipId, reward.relationshipId), eq(pointsLedger.userId, req.user.id)))) as [
        { balance: number },
      ];
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
          createdBy: req.user.id,
        })
        .returning();
      return entry!;
    });
    await deps.notifier.send(await managers(db, reward.relationshipId, req.user.id), {
      title: "Obey",
      body: `${req.user.displayName} redeemed a reward`,
      data: { type: "reward_redeemed", rewardId: reward.id },
    });
    reply.status(201);
    return ledgerDto(row);
  });
};
