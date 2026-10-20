import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { buildApp } from "../src/app.js";
import { createAuthenticator } from "../src/auth.js";
import { createDb, runMigrations } from "../src/db/index.js";
import { memoryNotifier } from "../src/notify.js";

export const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgres://obey:obey@localhost:5432/obey_test";

export async function setup() {
  const { db, close } = createDb(TEST_DB);
  await db.execute(sql`drop schema if exists public cascade`);
  await db.execute(sql`drop schema if exists drizzle cascade`);
  await db.execute(sql`create schema public`);
  await runMigrations(TEST_DB);

  const clock = { now: new Date("2026-10-16T12:00:00Z") };
  const notifier = memoryNotifier();
  const app = buildApp({
    db,
    authenticate: createAuthenticator({ devAuth: true, firebase: null }),
    notifier,
    now: () => clock.now,
    materializeDays: 14,
  });
  await app.ready();

  const as = (userId: string, name = "User") => {
    const headers = { "x-dev-user": userId, "x-dev-name": name };
    const call = async (method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", url: string, payload?: unknown) => {
      const res = await app.inject({ method, url, payload: payload as object, headers });
      return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : undefined };
    };
    return {
      headers,
      get: (url: string) => call("GET", url),
      post: (url: string, payload?: unknown) => call("POST", url, payload ?? {}),
      patch: (url: string, payload: unknown) => call("PATCH", url, payload),
      put: (url: string, payload: unknown) => call("PUT", url, payload),
      del: (url: string) => call("DELETE", url),
    };
  };

  /** A relationship with a Dominant and a submissive, both signed up. */
  async function pair() {
    const dom = as(randomUUID(), "Dom");
    const sub = as(randomUUID(), "Sub");
    const rel = (await dom.post("/relationships", { name: "Us", role: "dominant" })).body;
    const invite = (await dom.post(`/relationships/${rel.id}/invites`)).body;
    await sub.post("/relationships/join", { code: invite.code, role: "submissive" });
    const me = async (c: typeof dom) => (await c.get("/me")).body.user.id as string;
    return { dom, sub, relId: rel.id as string, domId: await me(dom), subId: await me(sub) };
  }

  return { app, db, clock, notifier, as, pair, close: async () => (await app.close(), await close()) };
}
