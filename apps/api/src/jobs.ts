import type { Db } from "./db/index.js";
import { managers } from "./services/access.js";
import { claimReminders, markMissed, materializeAll } from "./services/scheduling.js";
import type { Notifier } from "./notify.js";

/** One pass of the background work. Every step is idempotent, so overlapping or repeated runs are safe. */
export async function runJobs(db: Db, notifier: Notifier, now: Date, opts: { materializeDays: number; reminderLeadMinutes: number }) {
  await materializeAll(db, opts.materializeDays, now);

  const missed = await db.transaction((tx) => markMissed(tx, now));
  for (const { occ, series, consequence } of missed) {
    await notifier.send([series.assigneeId], {
      title: "Obey",
      body: consequence ? "A task was missed, and a consequence was added" : "A task was missed",
      data: { type: "occurrence_missed", occurrenceId: occ.id },
    });
    await notifier.send(await managers(db, series.relationshipId, series.assigneeId), {
      title: "Obey",
      body: "Your partner missed a task",
      data: { type: "occurrence_missed", occurrenceId: occ.id },
    });
  }

  const reminders = await claimReminders(db, now, opts.reminderLeadMinutes);
  for (const { occ, series } of reminders) {
    await notifier.send([series.assigneeId], { title: "Obey", body: "A task is due soon", data: { type: "reminder", occurrenceId: occ.id } });
  }
  return { missed: missed.length, reminders: reminders.length };
}
