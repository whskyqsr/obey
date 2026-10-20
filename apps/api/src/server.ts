import { buildApp } from "./app.js";
import { createAuthenticator } from "./auth.js";
import { config } from "./config.js";
import { createDb, runMigrations } from "./db/index.js";
import { initFirebase } from "./firebase.js";
import { fcmNotifier, noopNotifier, withPreferences } from "./notify.js";

const { db } = createDb(config.databaseUrl);
await runMigrations(config.databaseUrl);
const firebase = initFirebase(config.firebaseServiceAccount, config.firebaseProjectId);
if (!firebase && !config.devAuth) {
  console.warn("None of FIREBASE_SERVICE_ACCOUNT, FIREBASE_PROJECT_ID or DEV_AUTH=1 is set: nobody can sign in.");
} else if (firebase && !firebase.canSendPush) {
  console.warn("FIREBASE_SERVICE_ACCOUNT is not set: sign-in works, push notifications are off.");
}

const app = buildApp({
  db,
  authenticate: createAuthenticator({ devAuth: config.devAuth, firebase: firebase?.app ?? null }),
  notifier: withPreferences(db, firebase?.canSendPush ? fcmNotifier(db, firebase.app) : noopNotifier),
  now: () => new Date(),
  materializeDays: config.materializeDays,
  corsOrigins: config.corsOrigins,
  adminEmails: config.adminEmails,
  logger: true,
});
await app.listen({ port: config.port, host: "0.0.0.0" });
