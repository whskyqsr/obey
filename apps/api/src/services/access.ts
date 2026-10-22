import { AsyncLocalStorage } from "node:async_hooks";
import { and, eq, sql } from "drizzle-orm";
import type { Tx } from "../db/index.js";
import { memberships, relationships } from "../db/schema.js";
import { HttpError, forbidden, notFound } from "../errors.js";

/**
 * Whether the current request changes anything, set per request in app.ts. An ended dynamic stays readable, so every
 * membership check refuses writes to one without each route having to remember to.
 */
export const requestScope = new AsyncLocalStorage<{ write: boolean }>();

export type Role = "dominant" | "submissive" | "switch";

export async function membership(db: Tx, relationshipId: string, userId: string) {
  const [m] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.relationshipId, relationshipId), eq(memberships.userId, userId)));
  return m ?? null;
}

/**
 * Throws 404 (not 403, to avoid leaking existence) unless the user belongs to the relationship. Someone on their own in a
 * live dynamic (solo mode) both sets and does their tasks, so they act as a switch until a partner joins.
 */
export async function requireMember(db: Tx, relationshipId: string, userId: string) {
  const [row] = await db
    .select({
      m: memberships,
      endedAt: relationships.endedAt,
      members: sql<number>`(select count(*)::int from ${memberships} x where x.relationship_id = ${relationships.id})`,
    })
    .from(memberships)
    .innerJoin(relationships, eq(relationships.id, memberships.relationshipId))
    .where(and(eq(memberships.relationshipId, relationshipId), eq(memberships.userId, userId)));
  if (!row) throw notFound();
  if (row.endedAt && requestScope.getStore()?.write) throw new HttpError(409, "this dynamic has ended; it's kept read-only");
  if (row.members === 1 && !row.endedAt) return { ...row.m, role: "switch" as Role, solo: true };
  return { ...row.m, solo: false };
}

/** Dominants and switches manage the dynamic: tasks, rewards, consequences, rules, points. */
export const canManage = (role: Role) => role === "dominant" || role === "switch";

export async function requireManager(db: Tx, relationshipId: string, userId: string) {
  const m = await requireMember(db, relationshipId, userId);
  if (!canManage(m.role)) throw forbidden("only a Dominant can do this");
  return m;
}

export async function managers(db: Tx, relationshipId: string, exceptUserId?: string): Promise<string[]> {
  const rows = await db.select().from(memberships).where(eq(memberships.relationshipId, relationshipId));
  return rows.filter((r) => canManage(r.role) && r.userId !== exceptUserId).map((r) => r.userId);
}
