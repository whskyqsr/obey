import type { Db } from "./db/index.js";
import { managers } from "./services/access.js";
import { claimCurfewNudges, clockTime } from "./services/curfew.js";
import { finishStays } from "./services/location.js";
import { claimReminders, markMissed, materializeAll } from "./services/scheduling.js";
import { endSwap, expiredSwaps } from "./services/roleSwaps.js";
import { chastityEvents, chastityLocks, roleSwaps } from "./db/schema.js";
import { eq } from "drizzle-orm";
import { type Notifier, sendWithWords } from "./notify.js";
import { promptMonthReviews } from "./routes/months.js";
import { sceneCheckIns } from "./routes/scenes.js";
import { finishLocks, fmtLength } from "./routes/chastity.js";
import { deleteOldProofs } from "./services/proofRetention.js";

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

  // Stays that are up complete before misses are marked, so a stay running past the deadline isn't counted late.
  const stayed = await db.transaction((tx) => finishStays(tx, now));
  for (const { occ, series } of stayed) {
    // A kept curfew is the quiet, expected outcome; only a broken one is news.
    if (series.curfewUntil) continue;
    const submitted = occ.status === "submitted";
    await notifier.send(await managers(db, series.relationshipId, series.assigneeId), {
      title: "Fealty",
      body: submitted ? "Your partner submitted a task for review" : "Your partner completed a task",
      data: { type: submitted ? "occurrence_submitted" : "occurrence_completed", occurrenceId: occ.id },
    });
  }

  const missed = await db.transaction((tx) => markMissed(tx, now));
  for (const { occ, series, consequence } of missed) {
    // A consequence that adds lock time never becomes a task, so the push says what it did instead.
    const [lockTime] = await db
      .select({ minutes: chastityEvents.minutes, hidden: chastityLocks.hideTime })
      .from(chastityEvents)
      .innerJoin(chastityLocks, eq(chastityEvents.lockId, chastityLocks.id))
      .where(eq(chastityEvents.causedByOccurrenceId, occ.id));
    const added = lockTime?.minutes
      ? lockTime.hidden
        ? ", and time was added to your lock"
        : `, and ${fmtLength(lockTime.minutes)} ${lockTime.minutes === 60 || lockTime.minutes === 1440 ? "was" : "were"} added to your lock`
      : consequence
        ? ", and a consequence was added"
        : "";
    if (series.curfewUntil) {
      await notifier.send([series.assigneeId], {
        title: "Fealty",
        body: `You weren't home by curfew${added}`,
        data: { type: "occurrence_missed", occurrenceId: occ.id },
      });
      await notifier.send(await managers(db, series.relationshipId, series.assigneeId), {
        title: "Fealty",
        body: "Your partner wasn't home by curfew",
        data: { type: "occurrence_missed", occurrenceId: occ.id },
      });
      continue;
    }
    await notifier.send([series.assigneeId], {
      title: "Fealty",
      body: `A task was missed${added}`,
      data: { type: "occurrence_missed", occurrenceId: occ.id },
    });
    await notifier.send(await managers(db, series.relationshipId, series.assigneeId), {
      title: "Fealty",
      body: "Your partner missed a task",
      data: { type: "occurrence_missed", occurrenceId: occ.id },
    });
  }

  const reminders = await claimReminders(db, now, opts.reminderLeadMinutes);
  for (const { occ, series } of reminders) {
    // "No reminder": the Dominant would rather nudge them themselves.
    if (series.reminder === "none") continue;
    const push = { title: "Fealty", body: "A task is due soon", data: { type: "reminder", occurrenceId: occ.id } };
    // In the Dominant's words, but only for someone who lets partners' words onto their lock screen.
    const own = series.reminder === "custom" && series.reminderText ? { ...push, body: series.reminderText } : null;
    await sendWithWords(db, notifier, [series.assigneeId], push, own);
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
