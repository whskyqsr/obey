import { buildApp } from "./app.js";
import { createAuthenticator } from "./auth.js";
import { config } from "./config.js";
import { createDb, runMigrations } from "./db/index.js";
import { initFirebase } from "./firebase.js";
import { fcmNotifier, noopNotifier } from "./notify.js";

const { db } = createDb(config.databaseUrl);
await runMigrations(config.databaseUrl);
const firebase = initFirebase(config.firebaseServiceAccount);
if (!firebase && !config.devAuth) console.warn("Neither FIREBASE_SERVICE_ACCOUNT nor DEV_AUTH=1 is set: nobody can sign in.");

const app = buildApp({
  db,
  authenticate: createAuthenticator({ devAuth: config.devAuth, firebase }),
  notifier: firebase ? fcmNotifier(db, firebase) : noopNotifier,
  now: () => new Date(),
  materializeDays: config.materializeDays,
  corsOrigins: config.corsOrigins,
  logger: true,
});
await app.listen({ port: config.port, host: "0.0.0.0" });
