import { randomInt } from "node:crypto";
import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  allFeatures,
  createInvite,
  createRelationship,
  id,
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

const avatarVersion = (at: Date | null) => (at ? String(at.getTime()) : null);
const userDto = (u: { id: string; displayName: string; email: string | null; avatarUpdatedAt: Date | null; weekStart: string }) => ({
  id: u.id,
  displayName: u.displayName,
  email: u.email,
  avatarVersion: avatarVersion(u.avatarUpdatedAt),
  weekStart: u.weekStart === "mon" ? "mon" : "sun",
});

const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function relationshipDto(db: Tx, ids: string[]) {
  if (ids.length === 0) return [];
  const rels = await db.select().from(relationships).where(inArray(relationships.id, ids));
  const members = await db
    .select({
      relationshipId: memberships.relationshipId,
      userId: users.id,
      displayName: users.displayName,
      role: memberships.role,
      avatarUpdatedAt: users.avatarUpdatedAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(inArray(memberships.relationshipId, ids));
  return rels.map((r) => ({
    id: r.id,
    name: r.name,
    reschedulePolicy: r.reschedulePolicy,
    weeklyDelayAllowance: r.weeklyDelayAllowance,
    features: allFeatures(r.features),
    subNotes: r.subNotes,
    dates: r.dates,
    createdAt: r.createdAt.toISOString(),
    members: members
      .filter((m) => m.relationshipId === r.id)
      .map(({ userId, displayName, role, avatarUpdatedAt }) => ({ userId, displayName, role, avatarVersion: avatarVersion(avatarUpdatedAt) })),
  }));
}

export const relationshipRoutes = (deps: Deps) => async (app: FastifyInstance) => {
  const { db } = deps;

  app.get("/me", async (req) => {
    const mine = await db.select().from(memberships).where(eq(memberships.userId, req.user.id));
    return {
      user: userDto(req.user),
      relationships: await relationshipDto(db, mine.map((m) => m.relationshipId)),
    };
  });

  app.patch("/me", async (req) => {
    const body = updateMe.parse(req.body);
    if (!Object.keys(body).length) return userDto(req.user);
    const [updated] = await db.update(users).set(body).where(eq(users.id, req.user.id)).returning();
    return userDto(updated!);
  });

  // Clients crop and shrink the picture first (256px square), so 1 MB is generous.
  app.addContentTypeParser(AVATAR_TYPES, { parseAs: "buffer", bodyLimit: 1_000_000 }, (_req, body, done) => done(null, body));

  app.put("/me/avatar", async (req) => {
    const type = req.headers["content-type"]?.split(";")[0]?.trim() ?? "";
    if (!AVATAR_TYPES.includes(type) || !Buffer.isBuffer(req.body) || req.body.length === 0) {
      throw new HttpError(415, "send a JPEG, PNG or WebP image");
    }
    const now = deps.now();
    await db.update(users).set({ avatar: req.body, avatarType: type, avatarUpdatedAt: now }).where(eq(users.id, req.user.id));
    return userDto({ ...req.user, avatarUpdatedAt: now });
  });

  app.delete("/me/avatar", async (req) => {
    await db.update(users).set({ avatar: null, avatarType: null, avatarUpdatedAt: null }).where(eq(users.id, req.user.id));
    return userDto({ ...req.user, avatarUpdatedAt: null });
  });

  /** Your own picture, or that of anyone you share a relationship with. */
  app.get<{ Params: { id: string } }>("/users/:id/avatar", async (req, reply) => {
    if (!id.safeParse(req.params.id).success) throw notFound("no picture");
    if (req.params.id !== req.user.id) {
      const mine = db.select({ id: memberships.relationshipId }).from(memberships).where(eq(memberships.userId, req.user.id));
      const [shared] = await db
        .select({ id: memberships.relationshipId })
        .from(memberships)
        .where(and(eq(memberships.userId, req.params.id), inArray(memberships.relationshipId, mine)))
        .limit(1);
      if (!shared) throw notFound("no picture");
    }
    const [row] = await db.select({ avatar: users.avatar, type: users.avatarType }).from(users).where(eq(users.id, req.params.id));
    if (!row?.avatar || !row.type) throw notFound("no picture");
    // The URL carries ?v=<avatarVersion>, so a new picture is a new URL.
    return reply.header("content-type", row.type).header("cache-control", "private, max-age=31536000, immutable").send(row.avatar);
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
    const { features, ...body } = updateRelationship.parse(req.body);
    // Feature switches merge into what's stored, so one toggle doesn't reset the others.
    const merged = features ? sql`${relationships.features} || ${JSON.stringify(features)}::jsonb` : undefined;
    if (Object.keys(body).length || merged) {
      await db
        .update(relationships)
        .set({ ...body, ...(merged ? { features: merged } : {}) })
        .where(eq(relationships.id, req.params.id));
    }
    return (await relationshipDto(db, [req.params.id]))[0];
  });

  app.post<{ Params: { id: string } }>("/relationships/:id/invites", async (req, reply) => {
    const me = await requireMember(db, req.params.id, req.user.id);
    const body = createInvite.parse(req.body ?? {});
    // Unless told otherwise, a Dominant invites a submissive and a submissive invites a Dominant; a Switch leaves it open.
    const role = body.role !== undefined ? body.role : me.role === "dominant" ? "submissive" : me.role === "submissive" ? "dominant" : null;
    const expiresAt = new Date(deps.now().getTime() + 7 * 86_400_000);
    const [invite] = await db
      .insert(invites)
      .values({ code: inviteCode(), relationshipId: req.params.id, createdBy: req.user.id, expiresAt, role })
      .returning();
    reply.status(201);
    return { code: invite!.code, expiresAt: invite!.expiresAt.toISOString(), role: invite!.role };
  });

  /** What an invite link shows before it's accepted. */
  app.get<{ Params: { code: string } }>("/invites/:code", async (req) => {
    const [row] = await db
      .select({ invite: invites, inviterName: users.displayName })
      .from(invites)
      .innerJoin(users, eq(users.id, invites.createdBy))
      .where(and(eq(invites.code, req.params.code.trim().toUpperCase()), isNull(invites.usedBy), gt(invites.expiresAt, deps.now())));
    if (!row) throw notFound("invite not found or expired");
    const member = await db
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(and(eq(memberships.relationshipId, row.invite.relationshipId), eq(memberships.userId, req.user.id)));
    return {
      code: row.invite.code,
      relationshipId: row.invite.relationshipId,
      inviterName: row.inviterName,
      role: row.invite.role,
      alreadyMember: member.length > 0,
    };
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
      const role = invite.role ?? body.role;
      if (!role) throw new HttpError(400, "choose a role");
      const existing = await tx
        .select()
        .from(memberships)
        .where(and(eq(memberships.relationshipId, invite.relationshipId), eq(memberships.userId, req.user.id)));
      if (existing.length) throw new HttpError(409, "already a member");
      await tx.insert(memberships).values({ relationshipId: invite.relationshipId, userId: req.user.id, role });
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
