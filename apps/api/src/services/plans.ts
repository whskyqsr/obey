import { and, eq, gt, lte, or } from "drizzle-orm";
import { DateTime } from "luxon";
import { dueInstant, localDate, shiftLocal } from "@obey/recurrence";
import type { PlanRepeat } from "@obey/contracts";
import type { Tx } from "../db/index.js";
import { calendarEvents } from "../db/schema.js";
import { HttpError } from "../errors.js";

/** The most plans one repeating plan can make. */
export const MAX_REPEATS = 120;

const STEP: Record<PlanRepeat["every"], { days?: number; months?: number }> = {
  day: { days: 1 },
  week: { days: 7 },
  "2weeks": { days: 14 },
  month: { months: 1 },
};

/**
 * Every start and end of a repeating plan, through the end of [repeat.until] in [repeat.timezone]. Each step counts
 * from the first plan, so a plan on the 31st lands on the last day of shorter months and comes back after.
 */
export function repeatsOf(startsAt: Date, endsAt: Date, repeat: PlanRepeat): { startsAt: Date; endsAt: Date }[] {
  const zone = repeat.timezone;
  if (!DateTime.local().setZone(zone).isValid) throw new HttpError(400, `unknown timezone ${zone}`);
  if (repeat.until < localDate(startsAt, zone)) throw new HttpError(400, "a repeating plan has to end on or after its first day");
  const last = dueInstant(repeat.until, null, zone);
  const step = STEP[repeat.every];
  const out: { startsAt: Date; endsAt: Date }[] = [];
  for (let k = 0; ; k++) {
    const by = { days: (step.days ?? 0) * k, months: (step.months ?? 0) * k };
    const s = shiftLocal(startsAt, by, zone);
    if (s > last) break;
    if (out.length === MAX_REPEATS) throw new HttpError(400, `that makes more than ${MAX_REPEATS} plans; pick an earlier end`);
    out.push({ startsAt: s, endsAt: shiftLocal(endsAt, by, zone) });
  }
  return out;
}

/** Whether a plan with approved paused tasks covered [at] for [userId]: one they made, or one they're in on. */
export async function planPausedAt(db: Tx, relationshipId: string, userId: string, at: Date): Promise<boolean> {
  const [row] = await db
    .select({ id: calendarEvents.id })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.relationshipId, relationshipId),
        eq(calendarEvents.pauseStatus, "approved"),
        lte(calendarEvents.startsAt, at),
        gt(calendarEvents.endsAt, at),
        or(eq(calendarEvents.authorId, userId), eq(calendarEvents.withPartner, true)),
      ),
    )
    .limit(1);
  return !!row;
}
