import type { RoleSwap } from "@obey/contracts";
import { and, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import type { Tx } from "../db/index.js";
import { memberships, occurrences, roleSwaps, taskSeries } from "../db/schema.js";

export type Swap = typeof roleSwaps.$inferSelect;

export const swapDto = (s: Swap): RoleSwap => ({
  id: s.id,
  requestedBy: s.requestedBy,
  partnerId: s.partnerId,
  status: s.status === "active" ? "active" : "pending",
  endsAt: s.endsAt?.toISOString() ?? null,
  pauseTasks: s.pauseTasks,
  createdAt: s.createdAt.toISOString(),
  startedAt: s.startedAt?.toISOString() ?? null,
});

/** Each dynamic's open swap (asked for or under way), by relationship id. */
export async function openSwaps(db: Tx, relationshipIds: string[]): Promise<Map<string, Swap>> {
  if (relationshipIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(roleSwaps)
    .where(and(inArray(roleSwaps.relationshipId, relationshipIds), inArray(roleSwaps.status, ["pending", "active"])));
  return new Map(rows.map((r) => [r.relationshipId, r]));
}

const flip = { dominant: "submissive", submissive: "dominant" } as const;

/** Trades the two people's roles: Dominant becomes submissive and the other way round. */
export async function flipRoles(db: Tx, swap: Swap) {
  const rows = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.relationshipId, swap.relationshipId), inArray(memberships.userId, [swap.requestedBy, swap.partnerId])));
  for (const m of rows) {
    if (m.role === "switch") continue;
    await db
      .update(memberships)
      .set({ role: flip[m.role] })
      .where(and(eq(memberships.relationshipId, m.relationshipId), eq(memberships.userId, m.userId)));
  }
}

/**
 * Ends an active swap: roles go back, and tasks the swapped-in Dominant gave the other person during it stop, so the
 * swap leaves nothing running behind it. `by` is null when the time ran out.
 */
export async function endSwap(db: Tx, swap: Swap, by: string | null, now: Date) {
  await flipRoles(db, swap);
  const [swappedDom] = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.relationshipId, swap.relationshipId), inArray(memberships.userId, [swap.requestedBy, swap.partnerId]), eq(memberships.role, "submissive")));
  if (swappedDom && swap.startedAt) {
    const other = swappedDom.userId === swap.requestedBy ? swap.partnerId : swap.requestedBy;
    const given = await db
      .update(taskSeries)
      .set({ active: false, updatedAt: now })
      .where(
        and(
          eq(taskSeries.relationshipId, swap.relationshipId),
          eq(taskSeries.active, true),
          eq(taskSeries.createdBy, swappedDom.userId),
          eq(taskSeries.assigneeId, other),
          gte(taskSeries.createdAt, swap.startedAt),
        ),
      )
      .returning({ id: taskSeries.id });
    if (given.length)
      await db
        .update(occurrences)
        .set({ status: "cancelled" })
        .where(
          and(
            inArray(
              occurrences.seriesId,
              given.map((g) => g.id),
            ),
            eq(occurrences.status, "pending"),
          ),
        );
  }
  const [ended] = await db.update(roleSwaps).set({ status: "ended", endedAt: now, endedBy: by }).where(eq(roleSwaps.id, swap.id)).returning();
  return ended!;
}

/** Whether a swap had [userId]'s tasks paused at [at]. */
export async function tasksPausedAt(db: Tx, relationshipId: string, userId: string, at: Date): Promise<boolean> {
  const [row] = await db
    .select({ id: roleSwaps.id })
    .from(roleSwaps)
    .where(
      and(
        eq(roleSwaps.relationshipId, relationshipId),
        eq(roleSwaps.pausedUserId, userId),
        lte(roleSwaps.startedAt, at),
        or(isNull(roleSwaps.endedAt), gte(roleSwaps.endedAt, at)),
      ),
    )
    .limit(1);
  return !!row;
}

/** Swaps whose time is up, and requests whose time passed before anyone answered. */
export async function expiredSwaps(db: Tx, now: Date) {
  return db
    .select()
    .from(roleSwaps)
    .where(and(inArray(roleSwaps.status, ["pending", "active"]), lte(roleSwaps.endsAt, now)));
}

/** Whose tasks the dynamic's swap has paused right now, and until when (null: until someone swaps back). */
export async function pausedTasks(db: Tx, relationshipId: string): Promise<{ userId: string; until: Date | null } | null> {
  const [row] = await db
    .select()
    .from(roleSwaps)
    .where(and(eq(roleSwaps.relationshipId, relationshipId), eq(roleSwaps.status, "active")));
  return row?.pausedUserId ? { userId: row.pausedUserId, until: row.endsAt } : null;
}
