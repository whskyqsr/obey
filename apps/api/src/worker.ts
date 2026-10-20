import { config } from "./config.js";
import { createDb, runMigrations } from "./db/index.js";
import { initFirebase } from "./firebase.js";
import { runJobs } from "./jobs.js";
import { fcmNotifier, noopNotifier, withPreferences } from "./notify.js";

const INTERVAL_MS = 60_000;

const { db } = createDb(config.databaseUrl);
await runMigrations(config.databaseUrl);
// The worker only sends push, so it needs the service account.
const firebase = initFirebase(config.firebaseServiceAccount);
const notifier = withPreferences(db, firebase?.canSendPush ? fcmNotifier(db, firebase.app) : noopNotifier);

async function tick() {
  try {
    const result = await runJobs(db, notifier, new Date(), config);
    if (result.missed || result.reminders) console.log(JSON.stringify({ msg: "jobs", ...result }));
  } catch (err) {
    console.error("job run failed", err);
  }
  setTimeout(tick, INTERVAL_MS);
}
console.log("worker started");
await tick();
