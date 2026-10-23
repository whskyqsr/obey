import { type AftercarePlan, type Scene, aftercarePlanInput, allFeatures, checkWantsPartner, commentInput, sceneCheckInput, sceneInput, sceneSideInput } from "@obey/contracts";
import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, ne, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { DateTime } from "luxon";
import type { Deps } from "../app.js";
import type { Db } from "../db/index.js";
import { aftercarePlans, memberships, relationships, sceneComments, sceneMembers, scenes, users } from "../db/schema.js";
import { HttpError, forbidden, notFound } from "../errors.js";
import { type Notifier, sendWithWords } from "../notify.js";
import { canManage, requireMember } from "../services/access.js";

type SceneRow = typeof scenes.$inferSelect;
type MemberRow = typeof sceneMembers.$inferSelect;

/** 10:00 the day after the scene's night, where it happened; anything before 4 AM counts as the night before. */
export const checkFromOf = (occurredAt: Date, timezone: string) =>
  DateTime.fromJSDate(occurredAt).setZone(timezone).minus({ hours: 4 }).startOf("day").plus({ days: 1, hours: 10 }).toJSDate();

/** "last night" for an evening scene, "yesterday" for one earlier in the day. */
const whenWas = (s: SceneRow) => {
  const hour = DateTime.fromJSDate(s.occurredAt).setZone(s.timezone).hour;
  return hour >= 17 || hour < 4 ? "last night" : "yesterday";
};

function sceneDto(s: SceneRow, rows: MemberRow[], me: string): Scene {
  const shared = rows.filter((r) => r.sharedAt);
  // Sides stay hidden until you've shared yours, so neither of you writes to match the other.
  const iShared = shared.some((r) => r.userId === me);
  return {
    id: s.id,
    title: s.title,
    occurredAt: s.occurredAt.toISOString(),
    timezone: s.timezone,
    what: s.what,
    safeword: s.safeword,
    aftercare: s.aftercare,
    loggedBy: s.loggedBy,
    createdAt: s.createdAt.toISOString(),
    checkFrom: s.checkFrom.toISOString(),
    shared: shared.map((r) => r.userId),
    sides: shared
      .filter((r) => iShared || r.userId === me)
      .map((r) => ({ userId: r.userId, mood: r.mood!, worked: r.worked, change: r.change, need: r.need, sharedAt: r.sharedAt!.toISOString() })),
    checks: rows.filter((r) => r.checkAt).map((r) => ({ userId: r.userId, mood: r.checkMood!, note: r.checkNote, at: r.checkAt!.toISOString(), seen: !!r.checkSeenAt })),
    aftercareDone: !!rows.find((r) => r.userId === me)?.aftercareDoneAt,
    commentCount: s.commentCount,
  };
}

const validZone = (timezone: string) => {
  if (!DateTime.now().setZone(timezone).isValid) throw new HttpError(400, "unknown time zone");
};

/**
 * The scene log: either partner logs a scene, each writes their own side (seen by the others only once they've shared
 * theirs), and everyone gets a gentle check-in the day after. Each person keeps an aftercare plan, shown to the others on
 * Today right after a scene is logged. Pushes never say "scene" unless someone has chosen to see their partner's words.
 */
export const sceneRoutes = (deps: Deps) => async (app: FastifyInstance) => {
  const { db, notifier } = deps;

  async function requireScenes(relationshipId: string, userId: string) {
    const m = await requireMember(db, relationshipId, userId);
    const [rel] = await db.select({ features: relationships.features }).from(relationships).where(eq(relationships.id, relationshipId));
    if (!allFeatures(rel!.features).scenes) throw forbidden("scenes are switched off for this dynamic");
    return m;
  }
  async function loadScene(id: string, userId: string) {
    const [s] = await db.select().from(scenes).where(eq(scenes.id, id));
    if (!s) throw notFound();
    const m = await requireScenes(s.relationshipId, userId);
    return { s, m };
  }
  const membersOf = (sceneId: string) => db.select().from(sceneMembers).where(eq(sceneMembers.sceneId, sceneId));
  const dto = async (s: SceneRow, me: string) => sceneDto(s, await membersOf(s.id), me);
  const others = async (relationshipId: string, me: string) =>
    (await db.select({ userId: memberships.userId }).from(memberships).where(eq(memberships.relationshipId, relationshipId))).map((m) => m.userId).filter((id) => id !== me);
  /** Upserts my row on a scene with [set]. */
  const updateMine = (sceneId: string, userId: string, set: Partial<MemberRow>) =>
    db
      .insert(sceneMembers)
      .values({ sceneId, userId, ...set })
      .onConflictDoUpdate({ target: [sceneMembers.sceneId, sceneMembers.userId], set });

  app.get<{ Params: { id: string } }>("/relationships/:id/scenes", async (req) => {
    await requireScenes(req.params.id, req.user.id);
    const list = await db.select().from(scenes).where(eq(scenes.relationshipId, req.params.id)).orderBy(desc(scenes.occurredAt)).limit(100);
    const rows = list.length
      ? await db
          .select()
          .from(sceneMembers)
          .where(
            inArray(
              sceneMembers.sceneId,
              list.map((s) => s.id),
            ),
          )
      : [];
    return list.map((s) =>
      sceneDto(
        s,
        rows.filter((r) => r.sceneId === s.id),
        req.user.id,
      ),
    );
  });

  app.post<{ Params: { id: string } }>("/relationships/:id/scenes", async (req, reply) => {
    await requireScenes(req.params.id, req.user.id);
    const body = sceneInput.parse(req.body);
    validZone(body.timezone);
    const occurredAt = new Date(body.occurredAt);
    const [s] = await db
      .insert(scenes)
      .values({ ...body, occurredAt, relationshipId: req.params.id, loggedBy: req.user.id, checkFrom: checkFromOf(occurredAt, body.timezone) })
      .returning();
    const push = { title: "Fealty", body: `${req.user.displayName} asked how it went for you`, data: { type: "scene_logged", sceneId: s!.id } };
    await sendWithWords(
      db,
      notifier,
      await others(req.params.id, req.user.id),
      push,
      s!.title ? { ...push, body: `${req.user.displayName} asked how “${s!.title}” went for you` } : push,
    );
    reply.status(201);
    return dto(s!, req.user.id);
  });

  app.get<{ Params: { id: string } }>("/scenes/:id", async (req) => {
    const { s } = await loadScene(req.params.id, req.user.id);
    return dto(s, req.user.id);
  });

  app.put<{ Params: { id: string } }>("/scenes/:id", async (req) => {
    const { s } = await loadScene(req.params.id, req.user.id);
    const body = sceneInput.parse(req.body);
    validZone(body.timezone);
    const occurredAt = new Date(body.occurredAt);
    const checkFrom = checkFromOf(occurredAt, body.timezone);
    const moved = checkFrom.getTime() !== s.checkFrom.getTime() && checkFrom > deps.now();
    const [row] = await db
      .update(scenes)
      .set({ ...body, occurredAt, checkFrom, ...(moved && { checkPushedAt: null }) })
      .where(eq(scenes.id, s.id))
      .returning();
    return dto(row!, req.user.id);
  });

  app.delete<{ Params: { id: string } }>("/scenes/:id", async (req, reply) => {
    const { s, m } = await loadScene(req.params.id, req.user.id);
    if (s.loggedBy !== req.user.id && !(s.loggedBy === null && canManage(m.role))) throw forbidden("only whoever logged it can delete it");
    await db.delete(scenes).where(eq(scenes.id, s.id));
    reply.status(204);
  });

  // My side: shared when first saved, and editable afterwards.
  app.put<{ Params: { id: string } }>("/scenes/:id/side", async (req) => {
    const { s } = await loadScene(req.params.id, req.user.id);
    const body = sceneSideInput.parse(req.body);
    const before = (await membersOf(s.id)).find((r) => r.userId === req.user.id);
    await updateMine(s.id, req.user.id, { ...body, sharedAt: before?.sharedAt ?? deps.now() });
    if (!before?.sharedAt) {
      const push = { title: "Fealty", body: `${req.user.displayName} shared how it went`, data: { type: "scene_side", sceneId: s.id } };
      await sendWithWords(
        db,
        notifier,
        await others(s.relationshipId, req.user.id),
        push,
        s.title ? { ...push, body: `${req.user.displayName} shared how “${s.title}” went` } : push,
      );
    }
    return dto(s, req.user.id);
  });

  app.put<{ Params: { id: string } }>("/scenes/:id/check", async (req) => {
    const { s } = await loadScene(req.params.id, req.user.id);
    const body = sceneCheckInput.parse(req.body);
    if (deps.now() < s.checkFrom) throw new HttpError(409, "the check-in opens the day after");
    await updateMine(s.id, req.user.id, { checkMood: body.mood, checkNote: body.note, checkAt: deps.now(), checkSeenAt: null });
    // Feeling low, or still needing something, reaches the others the way a low task check-in does.
    if (checkWantsPartner(body)) {
      const name = req.user.displayName;
      const push = {
        title: "Fealty",
        body: body.mood <= 2 ? `${name} checked in feeling ${body.mood === 1 ? "awful" : "low"}` : `${name} checked in and still needs something`,
        data: { type: "scene_check", sceneId: s.id },
      };
      await sendWithWords(db, notifier, await others(s.relationshipId, req.user.id), push, body.note ? { ...push, body: `${push.body}: “${body.note}”` } : null);
    }
    return dto(s, req.user.id);
  });

  // Someone else has seen a check-in that asked for them; a comment on the scene does this too.
  app.post<{ Params: { id: string; userId: string } }>("/scenes/:id/checks/:userId/seen", async (req) => {
    const { s } = await loadScene(req.params.id, req.user.id);
    if (req.params.userId === req.user.id) throw forbidden("someone else marks your check-in seen");
    const [row] = await db
      .update(sceneMembers)
      .set({ checkSeenAt: deps.now() })
      .where(and(eq(sceneMembers.sceneId, s.id), eq(sceneMembers.userId, req.params.userId), isNotNull(sceneMembers.checkAt), isNull(sceneMembers.checkSeenAt)))
      .returning();
    if (!row && !(await membersOf(s.id)).some((r) => r.userId === req.params.userId && r.checkAt)) throw notFound("no check-in to see");
    return dto(s, req.user.id);
  });

  app.post<{ Params: { id: string } }>("/scenes/:id/aftercare-done", async (req) => {
    const { s } = await loadScene(req.params.id, req.user.id);
    await updateMine(s.id, req.user.id, { aftercareDoneAt: deps.now() });
    return dto(s, req.user.id);
  });

  app.get<{ Params: { id: string } }>("/scenes/:id/comments", async (req) => {
    const { s } = await loadScene(req.params.id, req.user.id);
    const rows = await db.select().from(sceneComments).where(eq(sceneComments.sceneId, s.id)).orderBy(asc(sceneComments.createdAt));
    return rows.map((c) => ({ id: c.id, sceneId: c.sceneId, authorId: c.authorId, body: c.body, createdAt: c.createdAt.toISOString() }));
  });

  app.post<{ Params: { id: string } }>("/scenes/:id/comments", async (req, reply) => {
    const { s } = await loadScene(req.params.id, req.user.id);
    const { body } = commentInput.parse(req.body);
    const c = await db.transaction(async (tx) => {
      const [row] = await tx.insert(sceneComments).values({ sceneId: s.id, authorId: req.user.id, body }).returning();
      await tx
        .update(scenes)
        .set({ commentCount: sql`${scenes.commentCount} + 1` })
        .where(eq(scenes.id, s.id));
      // Replying is seeing: the others' check-ins leave this person's Needs you.
      await tx
        .update(sceneMembers)
        .set({ checkSeenAt: deps.now() })
        .where(and(eq(sceneMembers.sceneId, s.id), ne(sceneMembers.userId, req.user.id), isNotNull(sceneMembers.checkAt), isNull(sceneMembers.checkSeenAt)));
      return row!;
    });
    const push = { title: "Fealty", body: `${req.user.displayName} commented`, data: { type: "scene_comment", sceneId: s.id } };
    await sendWithWords(db, notifier, await others(s.relationshipId, req.user.id), push, { ...push, body: `${req.user.displayName}: “${body}”` });
    reply.status(201);
    return { id: c.id, sceneId: c.sceneId, authorId: c.authorId, body: c.body, createdAt: c.createdAt.toISOString() };
  });

  app.delete<{ Params: { id: string } }>("/scene-comments/:id", async (req, reply) => {
    const [c] = await db.select().from(sceneComments).where(eq(sceneComments.id, req.params.id));
    if (!c) throw notFound();
    await loadScene(c.sceneId, req.user.id);
    if (c.authorId !== req.user.id) throw forbidden("you can only delete your own comments");
    await db.transaction(async (tx) => {
      await tx.delete(sceneComments).where(eq(sceneComments.id, c.id));
      await tx
        .update(scenes)
        .set({ commentCount: sql`greatest(${scenes.commentCount} - 1, 0)` })
        .where(eq(scenes.id, c.sceneId));
    });
    reply.status(204);
  });

  // Aftercare plans: one per person, listed for everyone in the dynamic.
  app.get<{ Params: { id: string } }>("/relationships/:id/aftercare", async (req): Promise<AftercarePlan[]> => {
    await requireScenes(req.params.id, req.user.id);
    const members = await db.select({ userId: memberships.userId }).from(memberships).where(eq(memberships.relationshipId, req.params.id));
    const plans = new Map((await db.select().from(aftercarePlans).where(eq(aftercarePlans.relationshipId, req.params.id))).map((p) => [p.userId, p]));
    return members.map(({ userId }) => {
      const p = plans.get(userId);
      return { userId, needs: p?.needs ?? [], note: p?.note ?? "", updatedAt: p?.updatedAt.toISOString() ?? null };
    });
  });

  app.put<{ Params: { id: string } }>("/relationships/:id/aftercare", async (req): Promise<AftercarePlan> => {
    await requireScenes(req.params.id, req.user.id);
    const body = aftercarePlanInput.parse(req.body);
    const set = { needs: body.needs, note: body.note, updatedAt: deps.now() };
    await db
      .insert(aftercarePlans)
      .values({ relationshipId: req.params.id, userId: req.user.id, ...set })
      .onConflictDoUpdate({ target: [aftercarePlans.relationshipId, aftercarePlans.userId], set });
    return { userId: req.user.id, ...body, updatedAt: set.updatedAt.toISOString() };
  });
};

/**
 * The next-day check-in push, once per scene; a scene logged more than a day after its check-in opened gets none. Each
 * person is asked how they feel, if they haven't said, and nudged to check in with the others.
 */
export async function sceneCheckIns(db: Db, notifier: Notifier, now: Date) {
  const due = await db
    .update(scenes)
    .set({ checkPushedAt: now })
    .where(and(isNull(scenes.checkPushedAt), lte(scenes.checkFrom, now)))
    .returning();
  let sent = 0;
  for (const s of due) {
    if (now.getTime() - s.checkFrom.getTime() > 86_400_000) continue;
    const [rel] = await db.select({ features: relationships.features, endedAt: relationships.endedAt }).from(relationships).where(eq(relationships.id, s.relationshipId));
    if (!rel || rel.endedAt || !allFeatures(rel.features).scenes) continue;
    const answered = new Set((await db.select().from(sceneMembers).where(eq(sceneMembers.sceneId, s.id))).filter((r) => r.checkAt).map((r) => r.userId));
    const people = await db
      .select({ userId: memberships.userId, name: users.displayName })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.relationshipId, s.relationshipId));
    const when = whenWas(s);
    for (const p of people) {
      const withWhom = people.filter((o) => o.userId !== p.userId).map((o) => o.name);
      const nudge = withWhom.length ? `check in with ${withWhom.join(" and ")}` : "";
      const body = answered.has(p.userId)
        ? nudge && `${nudge[0]!.toUpperCase()}${nudge.slice(1)} about ${when}`
        : `How are you feeling after ${when}?${nudge && ` And ${nudge}.`}`;
      if (body) await notifier.send([p.userId], { title: "Fealty", body, data: { type: "scene_check", sceneId: s.id } });
    }
    sent++;
  }
  return sent;
}
