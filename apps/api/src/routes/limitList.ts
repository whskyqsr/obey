import {
  LIMIT_OWN_SENTENCES,
  LIMIT_STARTERS,
  type LimitAnswer,
  type LimitList,
  type LimitSide,
  type Role,
  allFeatures,
  type LimitProfile,
  type LimitProfileMatch,
  limitAnswerInput,
  limitItemInput,
  limitProfileAnswerInput,
  limitProfileApplyInput,
  limitProfileChanges,
} from "@obey/contracts";
import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Deps } from "../app.js";
import { limitFinished, limitItems, limitPrefilled, limitProfile, limitRatings, memberships, relationships, users } from "../db/schema.js";
import { HttpError, forbidden, notFound } from "../errors.js";
import { requestScope, requireMember } from "../services/access.js";

const STARTER_KEYS = new Set(LIMIT_STARTERS.map((s) => s.key));

/**
 * The side someone answers on by default: their own role's, or for a switch the side opposite their partner's role.
 * A switch with no such partner has no usual side, so an answer without a side goes to both.
 */
export function usualSides(role: Role, partnerRole: Role | undefined): LimitSide[] {
  if (role === "dominant") return ["dom"];
  if (role === "submissive") return ["sub"];
  if (partnerRole === "dominant") return ["sub"];
  if (partnerRole === "submissive") return ["dom"];
  return ["dom", "sub"];
}

/**
 * The limits list: a starter list plus items the two of them add, each rated by each person both ways round (love, like,
 * curious, soft or hard limit), once with them in charge and once with their partner in charge. Your own answers are
 * always yours to see; a partner's show once everyone has finished, so nobody answers to match.
 */
export const limitListRoutes = (deps: Deps) => async (app: FastifyInstance) => {
  const { db, notifier } = deps;

  async function requireLimits(relationshipId: string, userId: string) {
    const m = await requireMember(db, relationshipId, userId);
    const [rel] = await db.select({ features: relationships.features }).from(relationships).where(eq(relationships.id, relationshipId));
    if (!allFeatures(rel!.features).limits) throw forbidden("limits are switched off for this dynamic");
    return m;
  }

  const members = (relationshipId: string) =>
    db.select({ userId: memberships.userId, role: memberships.role }).from(memberships).where(eq(memberships.relationshipId, relationshipId));
  const sidesFor = (people: { userId: string; role: Role }[], userId: string) =>
    usualSides(people.find((p) => p.userId === userId)!.role, people.find((p) => p.userId !== userId)?.role);

  /**
   * The first time you open a dynamic's list with nothing answered there yet, your own limits fill it in as a draft: nothing
   * is shared until you finish, and changes there stay with that dynamic. Says whether this list was ever filled in that way.
   */
  async function prefill(relationshipId: string, userId: string) {
    const [done] = await db
      .select({ at: limitPrefilled.filledAt })
      .from(limitPrefilled)
      .where(and(eq(limitPrefilled.relationshipId, relationshipId), eq(limitPrefilled.userId, userId)));
    if (done) return true;
    if (requestScope.getStore()?.ai) return false;
    const [rel] = await db.select({ endedAt: relationships.endedAt }).from(relationships).where(eq(relationships.id, relationshipId));
    if (rel?.endedAt) return false;
    const [answered, finished, profile] = await Promise.all([
      db
        .select({ k: limitRatings.itemKey })
        .from(limitRatings)
        .where(and(eq(limitRatings.relationshipId, relationshipId), eq(limitRatings.userId, userId)))
        .limit(1),
      db
        .select({ at: limitFinished.finishedAt })
        .from(limitFinished)
        .where(and(eq(limitFinished.relationshipId, relationshipId), eq(limitFinished.userId, userId))),
      db.select().from(limitProfile).where(eq(limitProfile.userId, userId)),
    ]);
    const rows = profile.filter((r) => STARTER_KEYS.has(r.itemKey) && (r.rating || r.note));
    if (answered.length || finished.length || !rows.length) return false;
    const now = deps.now();
    await db.transaction(async (tx) => {
      const [claimed] = await tx.insert(limitPrefilled).values({ relationshipId, userId, filledAt: now }).onConflictDoNothing().returning();
      if (!claimed) return;
      await tx
        .insert(limitRatings)
        .values(rows.map((r) => ({ relationshipId, userId, itemKey: r.itemKey, side: r.side, rating: r.rating, note: r.note, updatedAt: now })))
        .onConflictDoNothing();
    });
    return true;
  }

  const profileOf = async (userId: string) =>
    (await db.select().from(limitProfile).where(eq(limitProfile.userId, userId))).filter((r) => STARTER_KEYS.has(r.itemKey) && (r.rating || r.note));

  /** Your own limits, apart from any dynamic. */
  app.get("/me/limit-profile", async (req): Promise<LimitProfile> => {
    const rows = await profileOf(req.user.id);
    const side = (x: LimitSide): Record<string, LimitAnswer> =>
      Object.fromEntries(rows.filter((r) => r.side === x).map((r) => [r.itemKey, { rating: r.rating, note: r.note }]));
    return {
      items: LIMIT_STARTERS.map((s) => ({ ...s, custom: false, createdBy: null })),
      rated: new Set(rows.filter((r) => r.rating).map((r) => r.itemKey)).size,
      sides: { dom: side("dom"), sub: side("sub") },
    };
  });

  app.put<{ Params: { key: string } }>("/me/limit-profile/answers/:key", async (req) => {
    if (!STARTER_KEYS.has(req.params.key)) throw notFound();
    const body = limitProfileAnswerInput.parse(req.body);
    const row = and(eq(limitProfile.userId, req.user.id), eq(limitProfile.itemKey, req.params.key), eq(limitProfile.side, body.side));
    if (!body.rating && !body.note) await db.delete(limitProfile).where(row);
    else
      await db
        .insert(limitProfile)
        .values({ userId: req.user.id, itemKey: req.params.key, side: body.side, rating: body.rating, note: body.note, updatedAt: deps.now() })
        .onConflictDoUpdate({
          target: [limitProfile.userId, limitProfile.itemKey, limitProfile.side],
          set: { rating: body.rating, note: body.note, updatedAt: deps.now() },
        });
    return { rating: body.rating, note: body.note };
  });

  /** Your live dynamics with limits on whose lists you've started, and how many of the given answers read differently there from your limits. */
  async function differences(userId: string, changes: { itemKey: string; side: LimitSide }[], only?: string[]) {
    const keys = changes.filter((c) => STARTER_KEYS.has(c.itemKey));
    const mine = await db
      .select({ relationshipId: relationships.id, name: relationships.name, features: relationships.features })
      .from(memberships)
      .innerJoin(relationships, eq(relationships.id, memberships.relationshipId))
      .where(and(eq(memberships.userId, userId), isNull(relationships.endedAt)));
    const live = mine.filter((r) => allFeatures(r.features).limits && (!only || only.includes(r.relationshipId)));
    if (!keys.length || !live.length) return [];
    const relIds = live.map((r) => r.relationshipId);
    const [profile, ratings, prefilled, finished, partners] = await Promise.all([
      profileOf(userId),
      db.select().from(limitRatings).where(and(inArray(limitRatings.relationshipId, relIds), eq(limitRatings.userId, userId))),
      db.select().from(limitPrefilled).where(and(inArray(limitPrefilled.relationshipId, relIds), eq(limitPrefilled.userId, userId))),
      db.select().from(limitFinished).where(and(inArray(limitFinished.relationshipId, relIds), eq(limitFinished.userId, userId))),
      db
        .select({ relationshipId: memberships.relationshipId, name: users.displayName })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(and(inArray(memberships.relationshipId, relIds), ne(memberships.userId, userId))),
    ]);
    const same = (a?: { rating: string | null; note: string }, b?: { rating: string | null; note: string }) =>
      (a?.rating ?? null) === (b?.rating ?? null) && (a?.note ?? "") === (b?.note ?? "");
    return live.flatMap((r) => {
      const here = ratings.filter((x) => x.relationshipId === r.relationshipId);
      // A list you haven't started yet fills itself in from your limits when you open it.
      const started = here.length > 0 || prefilled.some((x) => x.relationshipId === r.relationshipId) || finished.some((x) => x.relationshipId === r.relationshipId);
      if (!started) return [];
      const differ = keys.filter((c) =>
        !same(
          profile.find((p) => p.itemKey === c.itemKey && p.side === c.side),
          here.find((x) => x.itemKey === c.itemKey && x.side === c.side),
        ),
      );
      if (!differ.length) return [];
      const name = partners.filter((p) => p.relationshipId === r.relationshipId).map((p) => p.name).join(" and ") || r.name || "Just you";
      return [{ relationshipId: r.relationshipId, name, differ, finished: finished.some((x) => x.relationshipId === r.relationshipId) }];
    });
  }

  /** Where the answers you just changed in your limits differ: Fealty asks before copying them anywhere, never syncs on its own. */
  app.post("/me/limit-profile/matches", async (req): Promise<LimitProfileMatch[]> => {
    const changes = limitProfileChanges.parse((req.body as { changes?: unknown } | undefined)?.changes);
    return (await differences(req.user.id, changes)).map(({ differ, ...r }) => ({ ...r, differ: differ.length }));
  });

  /** Copies the given answers from your limits into the dynamics you picked. */
  app.post("/me/limit-profile/apply", async (req) => {
    const body = limitProfileApplyInput.parse(req.body);
    const targets = await differences(req.user.id, body.changes, body.relationshipIds);
    const profile = await profileOf(req.user.id);
    const now = deps.now();
    for (const t of targets) {
      await requireLimits(t.relationshipId, req.user.id);
      for (const c of t.differ) {
        const p = profile.find((x) => x.itemKey === c.itemKey && x.side === c.side);
        const row = and(
          eq(limitRatings.relationshipId, t.relationshipId),
          eq(limitRatings.userId, req.user.id),
          eq(limitRatings.itemKey, c.itemKey),
          eq(limitRatings.side, c.side),
        );
        if (!p) await db.delete(limitRatings).where(row);
        else
          await db
            .insert(limitRatings)
            .values({ relationshipId: t.relationshipId, userId: req.user.id, itemKey: c.itemKey, side: c.side, rating: p.rating, note: p.note, updatedAt: now })
            .onConflictDoUpdate({
              target: [limitRatings.relationshipId, limitRatings.userId, limitRatings.itemKey, limitRatings.side],
              set: { rating: p.rating, note: p.note, updatedAt: now },
            });
      }
    }
    return { updated: targets.map((t) => t.relationshipId) };
  });

  app.get<{ Params: { id: string } }>("/relationships/:id/limit-list", async (req): Promise<LimitList> => {
    await requireLimits(req.params.id, req.user.id);
    const relId = req.params.id;
    const prefilled = await prefill(relId, req.user.id);
    const [people, custom, ratings, finished] = await Promise.all([
      members(relId),
      db.select().from(limitItems).where(eq(limitItems.relationshipId, relId)).orderBy(asc(limitItems.createdAt)),
      db.select().from(limitRatings).where(eq(limitRatings.relationshipId, relId)),
      db.select().from(limitFinished).where(eq(limitFinished.relationshipId, relId)),
    ]);
    const items = [
      ...LIMIT_STARTERS.map((s) => ({
        ...s,
        custom: false,
        createdBy: null,
      })),
      ...custom.map((c) => ({
        key: c.id,
        category: c.category,
        title: c.title,
        custom: true,
        createdBy: c.createdBy,
        sentences: { ...LIMIT_OWN_SENTENCES },
      })),
    ];
    const live = new Set(items.map((i) => i.key));
    const everyoneDone = people.every((p) => finished.some((f) => f.userId === p.userId));
    return {
      items,
      people: people.map((p) => {
        const mine = ratings.filter((r) => r.userId === p.userId && live.has(r.itemKey) && (r.rating || r.note));
        const side = (x: LimitSide): Record<string, LimitAnswer> =>
          Object.fromEntries(mine.filter((r) => r.side === x).map((r) => [r.itemKey, { rating: r.rating, note: r.note }]));
        const sides = { dom: side("dom"), sub: side("sub") };
        const last = mine.reduce<Date | null>((a, r) => (!a || r.updatedAt > a ? r.updatedAt : a), null);
        const shown = p.userId === req.user.id || everyoneDone;
        return {
          userId: p.userId,
          finishedAt: finished.find((f) => f.userId === p.userId)?.finishedAt.toISOString() ?? null,
          updatedAt: last?.toISOString() ?? null,
          rated: new Set(mine.filter((r) => r.rating).map((r) => r.itemKey)).size,
          answers: shown ? sides[sidesFor(people, p.userId)[0]!] : null,
          sides: shown ? sides : null,
          fromProfile: p.userId === req.user.id && prefilled && !finished.some((f) => f.userId === p.userId),
        };
      }),
    };
  });

  app.put<{ Params: { id: string; key: string } }>("/relationships/:id/limit-list/answers/:key", async (req) => {
    await requireLimits(req.params.id, req.user.id);
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
    const sides = body.side ? [body.side] : sidesFor(await members(req.params.id), req.user.id);
    for (const side of sides) {
      const row = and(
        eq(limitRatings.relationshipId, req.params.id),
        eq(limitRatings.userId, req.user.id),
        eq(limitRatings.itemKey, key),
        eq(limitRatings.side, side),
      );
      if (!body.rating && !body.note) await db.delete(limitRatings).where(row);
      else
        await db
          .insert(limitRatings)
          .values({
            relationshipId: req.params.id,
            userId: req.user.id,
            itemKey: key,
            side,
            rating: body.rating,
            note: body.note,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [limitRatings.relationshipId, limitRatings.userId, limitRatings.itemKey, limitRatings.side],
            set: { rating: body.rating, note: body.note, updatedAt: now },
          });
    }
    return { rating: body.rating, note: body.note };
  });

  app.post<{ Params: { id: string } }>("/relationships/:id/limit-list/items", async (req, reply) => {
    await requireLimits(req.params.id, req.user.id);
    const body = limitItemInput.parse(req.body);
    const count = await db.select({ id: limitItems.id }).from(limitItems).where(eq(limitItems.relationshipId, req.params.id));
    if (count.length >= 200) throw new HttpError(409, "that's as many as the list holds");
    const [row] = await db
      .insert(limitItems)
      .values({
        relationshipId: req.params.id,
        category: body.category,
        title: body.title,
        createdBy: req.user.id,
      })
      .returning();
    return reply.status(201).send({
      key: row!.id,
      category: row!.category,
      title: row!.title,
      custom: true,
      createdBy: row!.createdBy,
      sentences: { ...LIMIT_OWN_SENTENCES },
    });
  });

  app.delete<{ Params: { id: string; key: string } }>("/relationships/:id/limit-list/items/:key", async (req, reply) => {
    await requireLimits(req.params.id, req.user.id);
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
    await requireLimits(req.params.id, req.user.id);
    const relId = req.params.id;
    await db
      .insert(limitFinished)
      .values({
        relationshipId: relId,
        userId: req.user.id,
        finishedAt: deps.now(),
      })
      .onConflictDoNothing();
    const people = await members(relId);
    const finished = await db.select().from(limitFinished).where(eq(limitFinished.relationshipId, relId));
    const others = people.map((p) => p.userId).filter((id) => id !== req.user.id);
    const everyone = people.every((p) => finished.some((f) => f.userId === p.userId));
    if (others.length)
      await notifier.send(others, {
        title: "Fealty",
        body: everyone ? "You've both finished your limits" : `${req.user.displayName} finished their limits`,
        data: { type: "limits", relationshipId: relId },
      });
    return { ok: true };
  });
};
