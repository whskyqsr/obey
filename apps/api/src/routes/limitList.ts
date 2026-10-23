import { LIMIT_STARTERS, type LimitAnswer, type LimitList, limitAnswerInput, limitItemInput } from "@obey/contracts";
import { and, asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Deps } from "../app.js";
import { limitFinished, limitItems, limitRatings, memberships } from "../db/schema.js";
import { HttpError, forbidden, notFound } from "../errors.js";
import { requireMember } from "../services/access.js";

const STARTER_KEYS = new Set(LIMIT_STARTERS.map((s) => s.key));

/**
 * The limits list: a starter list plus items the two of them add, each rated by each person for themselves (love, like,
 * curious, soft or hard limit). Your own answers are always yours to see; a partner's show once everyone has finished,
 * so nobody answers to match.
 */
export const limitListRoutes = (deps: Deps) => async (app: FastifyInstance) => {
  const { db, notifier } = deps;

  const members = (relationshipId: string) => db.select({ userId: memberships.userId }).from(memberships).where(eq(memberships.relationshipId, relationshipId));

  app.get<{ Params: { id: string } }>("/relationships/:id/limit-list", async (req): Promise<LimitList> => {
    await requireMember(db, req.params.id, req.user.id);
    const relId = req.params.id;
    const [people, custom, ratings, finished] = await Promise.all([
      members(relId),
      db.select().from(limitItems).where(eq(limitItems.relationshipId, relId)).orderBy(asc(limitItems.createdAt)),
      db.select().from(limitRatings).where(eq(limitRatings.relationshipId, relId)),
      db.select().from(limitFinished).where(eq(limitFinished.relationshipId, relId)),
    ]);
    const items = [
      ...LIMIT_STARTERS.map((s) => ({ ...s, custom: false, createdBy: null })),
      ...custom.map((c) => ({ key: c.id, category: c.category, title: c.title, custom: true, createdBy: c.createdBy })),
    ];
    const live = new Set(items.map((i) => i.key));
    const everyoneDone = people.every((p) => finished.some((f) => f.userId === p.userId));
    return {
      items,
      people: people.map((p) => {
        const mine = ratings.filter((r) => r.userId === p.userId && live.has(r.itemKey) && (r.rating || r.note));
        const answers: Record<string, LimitAnswer> = Object.fromEntries(mine.map((r) => [r.itemKey, { rating: r.rating, note: r.note }]));
        const last = mine.reduce<Date | null>((a, r) => (!a || r.updatedAt > a ? r.updatedAt : a), null);
        return {
          userId: p.userId,
          finishedAt: finished.find((f) => f.userId === p.userId)?.finishedAt.toISOString() ?? null,
          updatedAt: last?.toISOString() ?? null,
          rated: mine.filter((r) => r.rating).length,
          answers: p.userId === req.user.id || everyoneDone ? answers : null,
        };
      }),
    };
  });

  app.put<{ Params: { id: string; key: string } }>("/relationships/:id/limit-list/answers/:key", async (req) => {
    await requireMember(db, req.params.id, req.user.id);
    const { key } = req.params;
    if (!STARTER_KEYS.has(key)) {
      const ok = z.string().uuid().safeParse(key).success
        ? await db
            .select({ id: limitItems.id })
            .from(limitItems)
            .where(and(eq(limitItems.id, key), eq(limitItems.relationshipId, req.params.id)))
        : [];
      if (!ok.length) throw notFound();
    }
    const body = limitAnswerInput.parse(req.body);
    const now = deps.now();
    if (!body.rating && !body.note)
      await db.delete(limitRatings).where(and(eq(limitRatings.relationshipId, req.params.id), eq(limitRatings.userId, req.user.id), eq(limitRatings.itemKey, key)));
    else
      await db
        .insert(limitRatings)
        .values({ relationshipId: req.params.id, userId: req.user.id, itemKey: key, rating: body.rating, note: body.note, updatedAt: now })
        .onConflictDoUpdate({ target: [limitRatings.relationshipId, limitRatings.userId, limitRatings.itemKey], set: { rating: body.rating, note: body.note, updatedAt: now } });
    return { rating: body.rating, note: body.note };
  });

  app.post<{ Params: { id: string } }>("/relationships/:id/limit-list/items", async (req, reply) => {
    await requireMember(db, req.params.id, req.user.id);
    const body = limitItemInput.parse(req.body);
    const count = await db.select({ id: limitItems.id }).from(limitItems).where(eq(limitItems.relationshipId, req.params.id));
    if (count.length >= 200) throw new HttpError(409, "that's as many as the list holds");
    const [row] = await db.insert(limitItems).values({ relationshipId: req.params.id, category: body.category, title: body.title, createdBy: req.user.id }).returning();
    return reply.status(201).send({ key: row!.id, category: row!.category, title: row!.title, custom: true, createdBy: row!.createdBy });
  });

  app.delete<{ Params: { id: string; key: string } }>("/relationships/:id/limit-list/items/:key", async (req, reply) => {
    await requireMember(db, req.params.id, req.user.id);
    if (!z.string().uuid().safeParse(req.params.key).success) throw notFound();
    const [item] = await db
      .select()
      .from(limitItems)
      .where(and(eq(limitItems.id, req.params.key), eq(limitItems.relationshipId, req.params.id)));
    if (!item) throw notFound();
    if (item.createdBy !== req.user.id) throw forbidden("only the person who added it can remove it");
    await db.delete(limitRatings).where(and(eq(limitRatings.relationshipId, req.params.id), eq(limitRatings.itemKey, item.id)));
    await db.delete(limitItems).where(eq(limitItems.id, item.id));
    return reply.status(204).send();
  });

  /** Says you have finished. It can't be taken back: once everyone has, answers are shared, and later changes show as they happen. */
  app.put<{ Params: { id: string } }>("/relationships/:id/limit-list/finished", async (req) => {
    await requireMember(db, req.params.id, req.user.id);
    const relId = req.params.id;
    await db.insert(limitFinished).values({ relationshipId: relId, userId: req.user.id, finishedAt: deps.now() }).onConflictDoNothing();
    const people = await members(relId);
    const finished = await db.select().from(limitFinished).where(eq(limitFinished.relationshipId, relId));
    const others = people.map((p) => p.userId).filter((id) => id !== req.user.id);
    const everyone = people.every((p) => finished.some((f) => f.userId === p.userId));
    if (others.length)
      await notifier.send(others, {
        title: "Fealty",
        body: everyone ? "You've both finished your limits. See them side by side." : `${req.user.displayName} finished their limits. Yours are next.`,
        data: { type: "limits", relationshipId: relId },
      });
    return { ok: true };
  });
};
