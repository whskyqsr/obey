import type { Db } from "./db/index.js";
import { managers } from "./services/access.js";
import { claimCurfewNudges, clockTime } from "./services/curfew.js";
import { finishStays } from "./services/location.js";
import { claimReminders, markMissed, materializeAll } from "./services/scheduling.js";
import { endSwap, expiredSwaps } from "./services/roleSwaps.js";
import { chastityEvents, chastityLocks, roleSwaps, users } from "./db/schema.js";
import { eq } from "drizzle-orm";
import { type Notifier, wantsDetails } from "./notify.js";
import { promptMonthReviews } from "./routes/months.js";
import { sceneCheckIns } from "./routes/scenes.js";
import { finishLocks, fmtLength } from "./routes/chastity.js";
import { deleteOldProofs } from "./services/proofRetention.js";
import { pruneAi } from "./services/aiAccess.js";

/** One pass of the background work. Every step is idempotent, so overlapping or repeated runs are safe. */
export async function runJobs(db: Db, notifier: Notifier, now: Date, opts: { materializeDays: number; reminderLeadMinutes: number }) {
  await materializeAll(db, opts.materializeDays, now);

  // Timed role swaps whose time is up end before misses are marked, so the paused tasks pick up on time.
  for (const swap of await expiredSwaps(db, now)) {
    if (swap.status === "pending") {
      await db.update(roleSwaps).set({ status: "cancelled", endedAt: now }).where(eq(roleSwaps.id, swap.id));
      continue;
    }
    await db.transaction((tx) => endSwap(tx, swap, null, now));
    await notifier.send([swap.requestedBy, swap.partnerId], {
      title: "Fealty",
      body: "Your role swap is over. Your roles are back.",
      data: { type: "role_swap", relationshipId: swap.relationshipId },
    });
  }

  await finishLocks({ db, notifier }, now);
  await deleteOldProofs(db, now);
  await pruneAi(db, now);

  // Stays that are up complete before misses are marked, so a stay running past the deadline isn't counted late.
  const stayed = await db.transaction((tx) => finishStays(tx, now));
  for (const { occ, series } of stayed) {
    // A kept curfew is the quiet, expected outcome; only a broken one is news.
    if (series.curfewUntil) continue;
    const submitted = occ.status === "submitted";
    const name = await nameOf(db, series.assigneeId);
    await notifier.send(await managers(db, series.relationshipId, series.assigneeId), {
      title: "Fealty",
      body: submitted ? `${name} submitted a task for review` : `${name} completed a task`,
      data: { type: submitted ? "occurrence_submitted" : "occurrence_completed", occurrenceId: occ.id },
    });
  }

  const missed = await db.transaction((tx) => markMissed(tx, now));
  // One push per person for everything that slipped in this pass, so a day of untimed tasks doesn't arrive as a burst.
  const groups = new Map<string, { relationshipId: string; assigneeId: string; occIds: string[]; consequences: number; lockMinutes: number; lockHidden: boolean }>();
  for (const { occ, series, consequence } of missed) {
    // A consequence that adds lock time never becomes a task, so the push says what it did instead.
    const [lockTime] = await db
      .select({ minutes: chastityEvents.minutes, hidden: chastityLocks.hideTime })
      .from(chastityEvents)
      .innerJoin(chastityLocks, eq(chastityEvents.lockId, chastityLocks.id))
      .where(eq(chastityEvents.causedByOccurrenceId, occ.id));
    if (series.curfewUntil) {
      const added = lockTime?.minutes ? lockAdded(lockTime.minutes, lockTime.hidden) : consequence ? ", and a consequence was added" : "";
      await notifier.send([series.assigneeId], {
        title: "Fealty",
        body: `You weren't home by curfew${added}`,
        data: { type: "occurrence_missed", occurrenceId: occ.id },
      });
      await notifier.send(await managers(db, series.relationshipId, series.assigneeId), {
        title: "Fealty",
        body: `${await nameOf(db, series.assigneeId)} wasn't home by curfew`,
        data: { type: "occurrence_missed", occurrenceId: occ.id },
      });
      continue;
    }
    const key = `${series.relationshipId}:${series.assigneeId}`;
    const g = groups.get(key) ?? { relationshipId: series.relationshipId, assigneeId: series.assigneeId, occIds: [], consequences: 0, lockMinutes: 0, lockHidden: false };
    g.occIds.push(occ.id);
    if (lockTime?.minutes) {
      g.lockMinutes += lockTime.minutes;
      g.lockHidden ||= lockTime.hidden;
    } else if (consequence) g.consequences++;
    groups.set(key, g);
  }
  for (const g of groups.values()) {
    const n = g.occIds.length;
    const data = { type: "occurrence_missed", ...(n === 1 && { occurrenceId: g.occIds[0]! }) };
    const added = [
      g.consequences === 1 ? "a consequence was added" : g.consequences > 1 ? `${g.consequences} consequences were added` : "",
      g.lockMinutes ? lockAdded(g.lockMinutes, g.lockHidden).slice(", and ".length) : "",
    ].filter(Boolean);
    const tail = added.length ? `, and ${added.join(", and ")}` : "";
    await notifier.send([g.assigneeId], { title: "Fealty", body: `You missed ${n === 1 ? "a task" : `${n} tasks`}${tail}`, data });
    await notifier.send(await managers(db, g.relationshipId, g.assigneeId), {
      title: "Fealty",
      body: `${await nameOf(db, g.assigneeId)} missed ${n === 1 ? "a task" : `${n} tasks`}`,
      data,
    });
  }

  const reminders = await claimReminders(db, now, opts.reminderLeadMinutes);
  const byPerson = new Map<string, typeof reminders>();
  for (const r of reminders) {
    // "No reminder": the Dominant would rather nudge them themselves.
    if (r.series.reminder === "none") continue;
    byPerson.set(r.series.assigneeId, [...(byPerson.get(r.series.assigneeId) ?? []), r]);
  }
  for (const [userId, due] of byPerson) {
    // A reminder in the Dominant's words goes on its own, but only to someone who lets partners' words onto their lock screen.
    const words = await wantsDetails(db, userId);
    const own = words ? due.filter((r) => r.series.reminder === "custom" && r.series.reminderText) : [];
    for (const { occ, series } of own) await notifier.send([userId], { title: "Fealty", body: series.reminderText!, data: { type: "reminder", occurrenceId: occ.id } });
    const rest = due.filter((r) => !own.includes(r));
    if (!rest.length) continue;
    // Tasks with no time are due by the end of the day, so their reminder comes in the evening and says so.
    const today = rest.every((r) => !r.series.dueTime);
    const n = rest.length;
    const body = today
      ? n === 1
        ? "A task is still to do today"
        : `${n} tasks are still to do today`
      : n === 1
        ? "A task is due soon"
        : `${n} tasks are due soon`;
    await notifier.send([userId], { title: "Fealty", body, data: { type: "reminder", ...(n === 1 && { occurrenceId: rest[0]!.occ.id }) } });
  }
  const nudges = await db.transaction((tx) => claimCurfewNudges(tx, now));
  for (const { occ, series } of nudges) {
    await notifier.send([series.assigneeId], {
      title: "Fealty",
      body: `Curfew at ${clockTime(occ.dueAt, series.timezone)}. Time to head home.`,
      data: { type: "curfew", relationshipId: series.relationshipId },
    });
  }
  const reviews = await promptMonthReviews(db, notifier, now);
  const sceneChecks = await sceneCheckIns(db, notifier, now);
  return { missed: missed.length, reminders: reminders.length, reviews, sceneChecks };
}

async function nameOf(db: Db, userId: string): Promise<string> {
  const [u] = await db.select({ name: users.displayName }).from(users).where(eq(users.id, userId));
  return u?.name ?? "Your partner";
}

const lockAdded = (minutes: number, hidden: boolean) =>
  hidden ? ", and time was added to your lock" : `, and ${fmtLength(minutes)} ${minutes === 60 || minutes === 1440 ? "was" : "were"} added to your lock`;
