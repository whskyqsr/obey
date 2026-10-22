import { type RoleSwap, id, roleSwapInput } from "@obey/contracts";
import { and, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Deps } from "../app.js";
import { memberships, roleSwaps } from "../db/schema.js";
import { HttpError, notFound } from "../errors.js";
import { requireMember } from "../services/access.js";
import { endSwap, flipRoles, swapDto } from "../services/roleSwaps.js";

const MAX_DAYS = 30;

/**
 * Swapping roles. Either the Dominant or the submissive asks; nothing changes until the other accepts. While it's on,
 * the memberships carry the swapped roles, so everything else just follows them. Either of them can end it at any
 * time, and a timed one ends on its own (see jobs).
 */
export const roleSwapRoutes = (deps: Deps) => async (app: FastifyInstance) => {
  const { db, notifier } = deps;

  const open = async (relationshipId: string) =>
    (
      await db
        .select()
        .from(roleSwaps)
        .where(and(eq(roleSwaps.relationshipId, relationshipId), inArray(roleSwaps.status, ["pending", "active"])))
    )[0] ?? null;

  app.post<{ Params: { id: string } }>("/relationships/:id/role-swap", async (req, reply): Promise<RoleSwap> => {
    const relationshipId = req.params.id;
    const me = await requireMember(db, relationshipId, req.user.id);
    const body = roleSwapInput.extend({ partnerId: id.optional() }).parse(req.body ?? {});
    if (me.role === "switch") throw new HttpError(400, "a switch already does both");
    const want = me.role === "dominant" ? "submissive" : "dominant";
    const others = (await db.select().from(memberships).where(eq(memberships.relationshipId, relationshipId))).filter((m) => m.role === want);
    const partner = body.partnerId ? others.find((m) => m.userId === body.partnerId) : others.length === 1 ? others[0] : undefined;
    if (!partner) throw new HttpError(400, others.length ? "say who to swap with" : `there's no ${want} to swap with`);
    const now = deps.now();
    const endsAt = body.endsAt ? new Date(body.endsAt) : null;
    if (endsAt && (endsAt <= now || endsAt.getTime() - now.getTime() > MAX_DAYS * 86_400_000)) throw new HttpError(400, `pick a time in the next ${MAX_DAYS} days`);
    if (await open(relationshipId)) throw new HttpError(409, "there's already a swap asked for or under way");
    const [swap] = await db
      .insert(roleSwaps)
      .values({ relationshipId, requestedBy: req.user.id, partnerId: partner.userId, status: "pending", endsAt, pauseTasks: body.pauseTasks, createdAt: now })
      .returning();
    await notifier.send([partner.userId], {
      title: "Fealty",
      body: `${req.user.displayName} asked to swap roles`,
      data: { type: "role_swap", relationshipId },
    });
    reply.status(201);
    return swapDto(swap!);
  });

  app.post<{ Params: { id: string } }>("/relationships/:id/role-swap/accept", async (req): Promise<RoleSwap> => {
    const relationshipId = req.params.id;
    await requireMember(db, relationshipId, req.user.id);
    const swap = await open(relationshipId);
    if (!swap || swap.status !== "pending" || swap.partnerId !== req.user.id) throw notFound();
    const now = deps.now();
    if (swap.endsAt && swap.endsAt <= now) throw new HttpError(409, "the time for that swap has already passed");
    const started = await db.transaction(async (tx) => {
      const roles = await tx
        .select()
        .from(memberships)
        .where(and(eq(memberships.relationshipId, relationshipId), inArray(memberships.userId, [swap.requestedBy, swap.partnerId])));
      const sub = roles.find((m) => m.role === "submissive");
      if (roles.length !== 2 || !sub || !roles.some((m) => m.role === "dominant")) throw new HttpError(409, "your roles changed since this was asked");
      await flipRoles(tx, swap);
      const [s] = await tx
        .update(roleSwaps)
        .set({ status: "active", startedAt: now, pausedUserId: swap.pauseTasks ? sub.userId : null })
        .where(and(eq(roleSwaps.id, swap.id), eq(roleSwaps.status, "pending")))
        .returning();
      if (!s) throw notFound();
      return s;
    });
    await notifier.send([swap.requestedBy], {
      title: "Fealty",
      body: `${req.user.displayName} accepted. Your roles are swapped.`,
      data: { type: "role_swap", relationshipId },
    });
    return swapDto(started);
  });

  /** Declines or takes back a request, or ends a swap that's on. */
  app.delete<{ Params: { id: string } }>("/relationships/:id/role-swap", async (req, reply) => {
    const relationshipId = req.params.id;
    await requireMember(db, relationshipId, req.user.id);
    const swap = await open(relationshipId);
    if (!swap || (swap.requestedBy !== req.user.id && swap.partnerId !== req.user.id)) throw notFound();
    const other = swap.requestedBy === req.user.id ? swap.partnerId : swap.requestedBy;
    const now = deps.now();
    if (swap.status === "pending") {
      const declined = swap.partnerId === req.user.id;
      await db
        .update(roleSwaps)
        .set({ status: declined ? "declined" : "cancelled", endedAt: now, endedBy: req.user.id })
        .where(eq(roleSwaps.id, swap.id));
      if (declined) await notifier.send([other], { title: "Fealty", body: `${req.user.displayName} declined the role swap`, data: { type: "role_swap", relationshipId } });
    } else {
      await db.transaction((tx) => endSwap(tx, swap, req.user.id, now));
      await notifier.send([other], { title: "Fealty", body: `${req.user.displayName} ended the role swap. Your roles are back.`, data: { type: "role_swap", relationshipId } });
    }
    reply.status(204);
  });
};
