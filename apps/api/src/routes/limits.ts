import { limitInput } from "@obey/contracts";
import { asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Deps } from "../app.js";
import { limits, memberships } from "../db/schema.js";
import { forbidden, notFound, parsePatch } from "../errors.js";
import { requireMember } from "../services/access.js";

const limitDto = (l: typeof limits.$inferSelect) => ({
  id: l.id,
  relationshipId: l.relationshipId,
  ownerId: l.ownerId,
  title: l.title,
  kind: l.kind,
  note: l.note,
  createdAt: l.createdAt.toISOString(),
  updatedAt: l.updatedAt.toISOString(),
});

/**
 * Limits: hard, soft and curious. Everyone in the dynamic reads all of them, and each person writes only their own,
 * so nobody can quietly change a partner's hard limit. Partners hear when a limit is added or changed.
 */
export const limitRoutes = (deps: Deps) => async (app: FastifyInstance) => {
  const { db } = deps;

  const tellOthers = async (relationshipId: string, userId: string, name: string) => {
    const others = (await db.select({ id: memberships.userId }).from(memberships).where(eq(memberships.relationshipId, relationshipId)))
      .map((m) => m.id)
      .filter((id) => id !== userId);
    await deps.notifier.send(others, { title: "Fealty", body: `${name} updated their limits`, data: { type: "limits", relationshipId } });
  };

  const loadOwn = async (id: string, userId: string) => {
    const [l] = await db.select().from(limits).where(eq(limits.id, id));
    if (!l) throw notFound();
    await requireMember(db, l.relationshipId, userId);
    if (l.ownerId !== userId) throw forbidden("only the person whose limit it is can change it");
    return l;
  };

  app.get<{ Params: { id: string } }>("/relationships/:id/limits", async (req) => {
    await requireMember(db, req.params.id, req.user.id);
    const rows = await db.select().from(limits).where(eq(limits.relationshipId, req.params.id)).orderBy(asc(limits.createdAt));
    return rows.map(limitDto);
  });

  app.post<{ Params: { id: string } }>("/relationships/:id/limits", async (req, reply) => {
    await requireMember(db, req.params.id, req.user.id);
    const body = limitInput.parse(req.body);
    const [row] = await db
      .insert(limits)
      .values({ ...body, relationshipId: req.params.id, ownerId: req.user.id })
      .returning();
    await tellOthers(req.params.id, req.user.id, req.user.displayName);
    return reply.status(201).send(limitDto(row!));
  });

  app.patch<{ Params: { id: string } }>("/limits/:id", async (req) => {
    const existing = await loadOwn(req.params.id, req.user.id);
    const body = parsePatch(limitInput.partial(), req.body);
    const [row] = await db
      .update(limits)
      .set({ ...body, updatedAt: deps.now() })
      .where(eq(limits.id, existing.id))
      .returning();
    await tellOthers(existing.relationshipId, req.user.id, req.user.displayName);
    return limitDto(row!);
  });

  app.delete<{ Params: { id: string } }>("/limits/:id", async (req, reply) => {
    const existing = await loadOwn(req.params.id, req.user.id);
    await db.delete(limits).where(eq(limits.id, existing.id));
    return reply.status(204).send();
  });
};
