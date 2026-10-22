import { eq, gte, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { usageDaily } from "../db/schema.js";

export type UsageKind = "place_search" | "imagery_tile";

const utcDay = (d: Date) => d.toISOString().slice(0, 10);

/** Counts one call to an outside service today (UTC). Never fails the request it's counting. */
export async function countUsage(db: Db, kind: UsageKind, now: Date) {
  try {
    await db
      .insert(usageDaily)
      .values({ day: utcDay(now), kind, count: 1 })
      .onConflictDoUpdate({ target: [usageDaily.day, usageDaily.kind], set: { count: sql`${usageDaily.count} + 1` } });
  } catch (err) {
    console.error("usage count failed", err);
  }
}

/** Calls per day and kind over the last [days] days, newest first. */
export async function usageSince(db: Db, now: Date, days: number) {
  const from = utcDay(new Date(now.getTime() - days * 86_400_000));
  return db
    .select()
    .from(usageDaily)
    .where(gte(usageDaily.day, from))
    .orderBy(sql`${usageDaily.day} desc`, usageDaily.kind);
}

/** One day's counts, as { kind: count }. */
export async function usageOn(db: Db, day: Date) {
  const rows = await db
    .select()
    .from(usageDaily)
    .where(eq(usageDaily.day, utcDay(day)));
  return Object.fromEntries(rows.map((r) => [r.kind, r.count]));
}
