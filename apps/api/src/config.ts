function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export const config = {
  port: Number(env("PORT", "3000")),
  // No local default in production, so a missing variable fails loudly instead of dialing localhost.
  databaseUrl: env("DATABASE_URL", process.env.NODE_ENV === "production" ? undefined : "postgres://obey:obey@localhost:5432/obey"),
  /** Accept `X-Dev-User: <uuid>` instead of a Firebase token. Never enable in production. */
  devAuth: process.env.DEV_AUTH === "1",
  /** Firebase service account JSON (the whole file contents). Optional until Firebase is set up. */
  firebaseServiceAccount: process.env.FIREBASE_SERVICE_ACCOUNT,
  /** Enough to verify sign-in tokens when the service account isn't set yet (push stays off). */
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
  corsOrigins: env("CORS_ORIGINS", "http://localhost:5173").split(","),
  reminderLeadMinutes: Number(env("REMINDER_LEAD_MINUTES", "30")),
  materializeDays: Number(env("MATERIALIZE_DAYS", "14")),
};
