import { randomInt } from "node:crypto";
import { DateTime } from "luxon";
import { and, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { allFeatures, createInvite, createRelationship, id, joinRelationship, leaveRelationship, registerDevice, updateMe, updateRelationship } from "@obey/contracts";
import type { Deps } from "../app.js";
import type { Tx } from "../db/index.js";
import { blocks, devices, invites, memberships, relationships, users } from "../db/schema.js";
import { HttpError, notFound } from "../errors.js";
import { managers, membership, requireManager, requireMember } from "../services/access.js";
import { deleteAccount, endRelationship } from "../services/account.js";
import { openSwaps, swapDto } from "../services/roleSwaps.js";

// No 0/O/1/I so codes read cleanly aloud.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const inviteCode = () => Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");

const avatarVersion = (at: Date | null) => (at ? String(at.getTime()) : null);
export const userDto = (u: {
  id: string;
  displayName: string;
  email: string | null;
  avatarUpdatedAt: Date | null;
  weekStart: string;
  proofTermsAcceptedAt: Date | null;
  revealProofs: boolean;
  quietStart: string | null;
  quietEnd: string | null;
  timezone: string | null;
  mutedNotifications: string[];
  notifyDetails: boolean;
}) => ({
  id: u.id,
  displayName: u.displayName,
  email: u.email,
  avatarVersion: avatarVersion(u.avatarUpdatedAt),
  weekStart: u.weekStart === "mon" ? "mon" : "sun",
  proofTermsAccepted: u.proofTermsAcceptedAt !== null,
  revealProofs: u.revealProofs,
  quietHours: u.quietStart && u.quietEnd && u.timezone ? { start: u.quietStart, end: u.quietEnd, timezone: u.timezone } : null,
  mutedNotifications: u.mutedNotifications,
  notifyDetails: u.notifyDetails,
});

const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function relationshipDto(db: Tx, ids: string[]) {
  if (ids.length === 0) return [];
  const rels = await db.select().from(relationships).where(inArray(relationships.id, ids));
  const now = new Date();
  const members = await db
    .select({
      relationshipId: memberships.relationshipId,
      userId: users.id,
      displayName: users.displayName,
      role: memberships.role,
      avatarUpdatedAt: users.avatarUpdatedAt,
      locationStatus: users.locationStatus,
      notifyDetails: users.notifyDetails,
      locationPausedAt: memberships.locationPausedAt,
      locationPausedUntil: memberships.locationPausedUntil,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(inArray(memberships.relationshipId, ids));
  const swaps = await openSwaps(db, ids);
  return rels.map((r) => ({
    id: r.id,
    name: r.name,
    reschedulePolicy: r.reschedulePolicy,
    weeklyDelayAllowance: r.weeklyDelayAllowance,
    features: allFeatures(r.features),
    subNotes: r.subNotes,
    dates: r.dates,
    createdAt: r.createdAt.toISOString(),
    endedAt: r.endedAt?.toISOString() ?? null,
    endedBy: r.endedBy,
    roleSwap: !r.endedAt && swaps.has(r.id) ? swapDto(swaps.get(r.id)!) : null,
    members: members
      .filter((m) => m.relationshipId === r.id)
      .map(({ userId, displayName, role, avatarUpdatedAt, locationStatus, notifyDetails, locationPausedAt, locationPausedUntil }) => {
        const paused = locationPausedAt !== null && (locationPausedUntil === null || locationPausedUntil > now);
        return {
          userId,
          displayName,
          role,
          avatarVersion: avatarVersion(avatarUpdatedAt),
          locationStatus,
          locationPaused: paused,
          locationPausedUntil: paused ? (locationPausedUntil?.toISOString() ?? null) : null,
          notifyDetails,
        };
      }),
  }));
}

export const relationshipRoutes = (deps: Deps) => async (app: FastifyInstance) => {
  const { db } = deps;

  app.get("/me", async (req) => {
    const mine = await db.select().from(memberships).where(eq(memberships.userId, req.user.id));
    return {
      user: userDto(req.user),
      admin: req.admin,
      relationships: await relationshipDto(
        db,
        mine.map((m) => m.relationshipId),
      ),
    };
  });

  app.patch("/me", async (req) => {
    const { quietHours, ...body } = updateMe.parse(req.body);
    const set = {
      ...body,
      ...(quietHours !== undefined && { quietStart: quietHours?.start ?? null, quietEnd: quietHours?.end ?? null, timezone: quietHours?.timezone ?? null }),
    };
    if (quietHours && !DateTime.now().setZone(quietHours.timezone).isValid) throw new HttpError(400, "unknown time zone");
    if (!Object.keys(set).length) return userDto(req.user);
    const [updated] = await db.update(users).set(set).where(eq(users.id, req.user.id)).returning();
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

  /**
   * Deletes the account (see deleteAccount), then the sign-in itself. Allowed before verifying an email, so a
   * mistyped address can be thrown away.
   */
  app.delete("/me", { config: { allowUnverified: true } }, async (req, reply) => {
    const name = req.user.displayName;
    const { ended } = await deleteAccount(db, req.user.id, deps.now());
    for (const { relationshipId, others } of ended) {
      await deps.notifier.send(others, {
        title: "Fealty",
        body: `${name} deleted their account, so your dynamic has ended`,
        data: { type: "relationship_ended", relationshipId },
      });
    }
    try {
      await deps.deleteSignIn?.(req.user.authUid);
    } catch (e) {
      // The data is gone either way; a sign-in left behind just starts a fresh, empty account.
      req.log.error({ err: e }, "deleting the sign-in failed");
    }
    return reply.status(204).send();
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
    const [invite] = await db.insert(invites).values({ code: inviteCode(), relationshipId: req.params.id, createdBy: req.user.id, expiresAt, role }).returning();
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
        .where(and(eq(invites.code, body.code.trim().toUpperCase()), isNull(invites.usedBy), gt(invites.expiresAt, deps.now())))
        .returning();
      if (!invite) throw notFound("invite not found or expired");
      const role = invite.role ?? body.role;
      if (!role) throw new HttpError(400, "choose a role");
      const existing = await tx
        .select()
        .from(memberships)
        .where(and(eq(memberships.relationshipId, invite.relationshipId), eq(memberships.userId, req.user.id)));
      if (existing.length) throw new HttpError(409, "already a member");
      const [rel] = await tx.select({ endedAt: relationships.endedAt }).from(relationships).where(eq(relationships.id, invite.relationshipId));
      if (rel?.endedAt) throw new HttpError(410, "this dynamic has ended");
      const others = (await tx.select().from(memberships).where(eq(memberships.relationshipId, invite.relationshipId))).map((m) => m.userId);
      const blocked = others.length
        ? await tx
            .select()
            .from(blocks)
            .where(or(and(eq(blocks.blockerId, req.user.id), inArray(blocks.blockedId, others)), and(eq(blocks.blockedId, req.user.id), inArray(blocks.blockerId, others))))
        : [];
      // Same answer either way round, so a blocked person can't tell they were blocked.
      if (blocked.length) throw new HttpError(403, "you can't join this dynamic");
      await tx.insert(memberships).values({ relationshipId: invite.relationshipId, userId: req.user.id, role });
      return invite.relationshipId;
    });
    await deps.notifier.send(await managers(db, relId, req.user.id), {
      title: "Fealty",
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

  /** Ends the dynamic for both partners (see endRelationship). With `block`, the others can't pair with this person again. */
  app.post<{ Params: { id: string } }>("/relationships/:id/leave", async (req) => {
    const body = leaveRelationship.parse(req.body ?? {});
    const m = await membership(db, req.params.id, req.user.id);
    if (!m) throw notFound();
    const others = (await db.select().from(memberships).where(eq(memberships.relationshipId, req.params.id))).map((r) => r.userId).filter((u) => u !== req.user.id);
    const ended = await db.transaction(async (tx) => {
      // Only people actually in this dynamic can be blocked from it.
      const blocking = body.block.filter((u) => others.includes(u));
      if (blocking.length) {
        await tx
          .insert(blocks)
          .values(blocking.map((blockedId) => ({ blockerId: req.user.id, blockedId })))
          .onConflictDoNothing();
      }
      // Already ended; blocking afterwards is still allowed.
      return endRelationship(tx, req.params.id, req.user.id, deps.now());
    });
    if (ended) {
      await deps.notifier.send(others, {
        title: "Fealty",
        body: `${req.user.displayName} ended your dynamic`,
        data: { type: "relationship_ended", relationshipId: req.params.id },
      });
    }
    return (await relationshipDto(db, [req.params.id]))[0];
  });

  const myDevices = async (userId: string) =>
    (await db.select().from(devices).where(eq(devices.userId, userId)).orderBy(desc(devices.updatedAt))).map((d) => ({
      platform: d.platform,
      tokenTail: d.token.slice(-12),
      registeredAt: d.updatedAt.toISOString(),
      lastSentAt: d.lastSentAt?.toISOString() ?? null,
      lastError: d.lastError,
    }));

  app.get("/me/devices", async (req) => myDevices(req.user.id));

  /** Sends a test push to every device on this account, then reports how each went. */
  app.post("/me/test-push", async (req) => {
    await deps.notifier.send([req.user.id], { title: "Fealty", body: "Test notification: push works on this device.", data: { type: "test" } });
    return myDevices(req.user.id);
  });
};
