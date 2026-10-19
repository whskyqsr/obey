import { randomInt } from "node:crypto";
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createRelationship,
  joinRelationship,
  registerDevice,
  updateMe,
  updateRelationship,
} from "@obey/contracts";
import type { Deps } from "../app.js";
import type { Tx } from "../db/index.js";
import { devices, invites, memberships, relationships, users } from "../db/schema.js";
import { HttpError, notFound } from "../errors.js";
import { managers, requireManager, requireMember } from "../services/access.js";

// No 0/O/1/I so codes read cleanly aloud.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const inviteCode = () => Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");

export async function relationshipDto(db: Tx, ids: string[]) {
  if (ids.length === 0) return [];
  const rels = await db.select().from(relationships).where(inArray(relationships.id, ids));
  const members = await db
    .select({ relationshipId: memberships.relationshipId, userId: users.id, displayName: users.displayName, role: memberships.role })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(inArray(memberships.relationshipId, ids));
  return rels.map((r) => ({
    id: r.id,
    name: r.name,
    reschedulePolicy: r.reschedulePolicy,
    weeklyDelayAllowance: r.weeklyDelayAllowance,
    createdAt: r.createdAt.toISOString(),
    members: members
      .filter((m) => m.relationshipId === r.id)
      .map(({ userId, displayName, role }) => ({ userId, displayName, role })),
  }));
}

export const relationshipRoutes = (deps: Deps) => async (app: FastifyInstance) => {
  const { db } = deps;

  app.get("/me", async (req) => {
    const mine = await db.select().from(memberships).where(eq(memberships.userId, req.user.id));
    return {
      user: { id: req.user.id, displayName: req.user.displayName, email: req.user.email },
      relationships: await relationshipDto(db, mine.map((m) => m.relationshipId)),
    };
  });

  app.patch("/me", async (req) => {
    const body = updateMe.parse(req.body);
    const [user] = await db.update(users).set({ displayName: body.displayName }).where(eq(users.id, req.user.id)).returning();
    return { id: user!.id, displayName: user!.displayName, email: user!.email };
  });

  app.post("/relationships", async (req, reply) => {
    const body = createRelationship.parse(req.body);
    const id = await db.transaction(async (tx) => {
      const [rel] = await tx.insert(relationships).values({ name: body.name }).returning();
      await tx.insert(memberships).values({ relationshipId: rel!.id, userId: req.user.id, role: body.role });
      return rel!.id;
    });
    reply.status(201);
    return (await relationshipDto(db, [id]))[0];
  });

  app.patch<{ Params: { id: string } }>("/relationships/:id", async (req) => {
    await requireManager(db, req.params.id, req.user.id);
    const body = updateRelationship.parse(req.body);
    if (Object.keys(body).length) await db.update(relationships).set(body).where(eq(relationships.id, req.params.id));
    return (await relationshipDto(db, [req.params.id]))[0];
  });

  app.post<{ Params: { id: string } }>("/relationships/:id/invites", async (req, reply) => {
    await requireMember(db, req.params.id, req.user.id);
    const expiresAt = new Date(deps.now().getTime() + 7 * 86_400_000);
    const [invite] = await db
      .insert(invites)
      .values({ code: inviteCode(), relationshipId: req.params.id, createdBy: req.user.id, expiresAt })
      .returning();
    reply.status(201);
    return { code: invite!.code, expiresAt: invite!.expiresAt.toISOString() };
  });

  app.post("/relationships/join", async (req) => {
    const body = joinRelationship.parse(req.body);
    const relId = await db.transaction(async (tx) => {
      const [invite] = await tx
        .update(invites)
        .set({ usedBy: req.user.id })
        .where(
          and(eq(invites.code, body.code.trim().toUpperCase()), isNull(invites.usedBy), gt(invites.expiresAt, deps.now())),
        )
        .returning();
      if (!invite) throw notFound("invite not found or expired");
      const existing = await tx
        .select()
        .from(memberships)
        .where(and(eq(memberships.relationshipId, invite.relationshipId), eq(memberships.userId, req.user.id)));
      if (existing.length) throw new HttpError(409, "already a member");
      await tx.insert(memberships).values({ relationshipId: invite.relationshipId, userId: req.user.id, role: body.role });
      return invite.relationshipId;
    });
    await deps.notifier.send(await managers(db, relId, req.user.id), {
      title: "Obey",
      body: `${req.user.displayName} joined`,
      data: { type: "member_joined", relationshipId: relId },
    });
    return (await relationshipDto(db, [relId]))[0];
  });

  app.post("/devices", async (req, reply) => {
    const body = registerDevice.parse(req.body);
    await db
      .insert(devices)
      .values({ token: body.token, userId: req.user.id, platform: body.platform })
      .onConflictDoUpdate({ target: devices.token, set: { userId: req.user.id, platform: body.platform, updatedAt: deps.now() } });
    reply.status(204);
  });
};
