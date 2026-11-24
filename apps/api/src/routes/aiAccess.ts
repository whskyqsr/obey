import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Deps } from "../app.js";
import { aiCalls, aiGrants, memberships, oauthClients } from "../db/schema.js";
import { notFound } from "../errors.js";
import { membership, requireMember } from "../services/access.js";
import { aiReachable } from "../services/aiAccess.js";

const CALLS_SHOWN_DAYS = 30;

/** AI access for a dynamic: each member's switch, the apps connected to it, and the recent calls they made. App only. */
export const aiAccessRoutes = (deps: Deps) => async (app: FastifyInstance) => {
  const { db } = deps;

  const liveGrants = (userIds: string[]) =>
    db
      .select({ id: aiGrants.id, userId: aiGrants.userId, app: oauthClients.name, connectedAt: aiGrants.createdAt, lastUsedAt: aiGrants.lastUsedAt })
      .from(aiGrants)
      .innerJoin(oauthClients, eq(oauthClients.id, aiGrants.clientId))
      .where(and(inArray(aiGrants.userId, userIds), isNull(aiGrants.revokedAt), gt(aiGrants.refreshExpiresAt, deps.now())))
      .orderBy(desc(aiGrants.createdAt));

  const grantDto = (g: Awaited<ReturnType<typeof liveGrants>>[number]) => ({
    id: g.id,
    userId: g.userId,
    app: g.app,
    connectedAt: g.connectedAt.toISOString(),
    lastUsedAt: g.lastUsedAt?.toISOString() ?? null,
  });

  app.get<{ Params: { id: string } }>("/relationships/:id/ai-access", async (req) => {
    await requireMember(db, req.params.id, req.user.id);
    const members = await db.select({ userId: memberships.userId, allowed: memberships.aiAccess }).from(memberships).where(eq(memberships.relationshipId, req.params.id));
    const apps = await liveGrants(members.map((m) => m.userId));
    const since = new Date(deps.now().getTime() - CALLS_SHOWN_DAYS * 86_400_000);
    const calls = await db
      .select({ tool: aiCalls.tool, userId: aiCalls.userId, ok: aiCalls.ok, at: aiCalls.createdAt, app: oauthClients.name })
      .from(aiCalls)
      .leftJoin(aiGrants, eq(aiGrants.id, aiCalls.grantId))
      .leftJoin(oauthClients, eq(oauthClients.id, aiGrants.clientId))
      .where(and(eq(aiCalls.relationshipId, req.params.id), gt(aiCalls.createdAt, since)))
      .orderBy(desc(aiCalls.createdAt))
      .limit(200);
    return {
      reachable: await aiReachable(db, req.params.id),
      members,
      apps: apps.map(grantDto),
      calls: calls.map((c) => ({ tool: c.tool, userId: c.userId, ok: c.ok, app: c.app, at: c.at.toISOString() })),
    };
  });

  /** Your own switch. Turning it off always works, even in an ended dynamic; turning it on needs a live one. */
  app.put<{ Params: { id: string } }>("/relationships/:id/ai-access", async (req) => {
    const { allowed } = z.object({ allowed: z.boolean() }).parse(req.body);
    if (allowed) await requireMember(db, req.params.id, req.user.id);
    else if (!(await membership(db, req.params.id, req.user.id))) throw notFound();
    await db
      .update(memberships)
      .set({ aiAccess: allowed })
      .where(and(eq(memberships.relationshipId, req.params.id), eq(memberships.userId, req.user.id)));
    return { allowed, reachable: await aiReachable(db, req.params.id) };
  });

  app.get("/me/ai-apps", async (req) => (await liveGrants([req.user.id])).map(grantDto));

  /** Disconnects one of your AI apps: its tokens stop working at once. */
  app.delete<{ Params: { id: string } }>("/me/ai-apps/:id", async (req, reply) => {
    const [gone] = await db
      .update(aiGrants)
      .set({ revokedAt: deps.now() })
      .where(and(eq(aiGrants.id, req.params.id), eq(aiGrants.userId, req.user.id), isNull(aiGrants.revokedAt)))
      .returning({ id: aiGrants.id });
    if (!gone) throw notFound();
    reply.status(204);
  });
};
