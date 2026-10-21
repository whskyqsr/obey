import { config } from "./config.js";
import { createDb, runMigrations } from "./db/index.js";
import { initFirebase } from "./firebase.js";
import { runJobs } from "./jobs.js";
import { fcmNotifier, noopNotifier, withPreferences } from "./notify.js";
import { usageOn } from "./services/usage.js";

const INTERVAL_MS = 60_000;

const { db } = createDb(config.databaseUrl);
await runMigrations(config.databaseUrl);
// The worker only sends push, so it needs the service account.
const firebase = initFirebase(config.firebaseServiceAccount);
const notifier = withPreferences(db, firebase?.canSendPush ? fcmNotifier(db, firebase.app) : noopNotifier);

let loggedUsageFor = "";

/** Once a day, yesterday's calls to outside services, as one log line to search for ("usage"). */
async function logUsage(now: Date) {
  const yesterday = new Date(now.getTime() - 86_400_000);
  const day = yesterday.toISOString().slice(0, 10);
  if (day === loggedUsageFor) return;
  loggedUsageFor = day;
  console.log(JSON.stringify({ msg: "usage", day, ...(await usageOn(db, yesterday)) }));
}

async function tick() {
  try {
    await logUsage(new Date());
    const result = await runJobs(db, notifier, new Date(), config);
    if (result.missed || result.reminders) console.log(JSON.stringify({ msg: "jobs", ...result }));
  } catch (err) {
    console.error("job run failed", err);
  }
  setTimeout(tick, INTERVAL_MS);
}
console.log("worker started");
await tick();
