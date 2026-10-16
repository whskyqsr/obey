import { and, eq } from "drizzle-orm";
import type { Tx } from "../db/index.js";
import { memberships } from "../db/schema.js";
import { forbidden, notFound } from "../errors.js";

export type Role = "dominant" | "submissive" | "switch";

export async function membership(db: Tx, relationshipId: string, userId: string) {
  const [m] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.relationshipId, relationshipId), eq(memberships.userId, userId)));
  return m ?? null;
}

/** Throws 404 (not 403, to avoid leaking existence) unless the user belongs to the relationship. */
export async function requireMember(db: Tx, relationshipId: string, userId: string) {
  const m = await membership(db, relationshipId, userId);
  if (!m) throw notFound();
  return m;
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
