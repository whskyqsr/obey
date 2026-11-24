import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { createAuthenticator } from "../src/auth.js";
import { createDb } from "../src/db/index.js";
import { memoryNotifier } from "../src/notify.js";
import { TEST_DB } from "./helpers.js";

// None of these requests reach the database, so this runs without one.
const build = () =>
  buildApp({
    db: createDb(TEST_DB).db,
    authenticate: createAuthenticator({ devAuth: true, firebase: null }),
    notifier: memoryNotifier(),
    now: () => new Date("2026-10-16T12:00:00Z"),
    materializeDays: 14,
    rateLimit: { max: 3 },
  });

describe("rate limits", () => {
  it("stops one address after the limit, counts addresses apart, and leaves /health alone", async () => {
    const app = build();
    const hit = (ip: string, url = "/.well-known/oauth-authorization-server") => app.inject({ method: "GET", url, headers: { "x-real-ip": ip } });
    for (let i = 0; i < 3; i++) expect((await hit("203.0.113.1")).statusCode).toBe(200);
    expect((await hit("203.0.113.1")).statusCode).toBe(429);
    expect((await hit("203.0.113.2")).statusCode).toBe(200);
    for (let i = 0; i < 5; i++) expect((await hit("203.0.113.1", "/health")).statusCode).toBe(200);
    await app.close();
  });

  it("gives a route its own limit when it sets one", async () => {
    const app = build();
    // /oauth/authorize allows 30 a minute, more than the overall 3 here; a bad request answers 400 without the database.
    for (let i = 0; i < 30; i++) expect((await app.inject({ method: "GET", url: "/oauth/authorize", headers: { "x-real-ip": "203.0.113.9" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/oauth/authorize", headers: { "x-real-ip": "203.0.113.9" } })).statusCode).toBe(429);
    await app.close();
  });
});
