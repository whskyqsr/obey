import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { createAuthenticator } from "../src/auth.js";
import { memoryNotifier } from "../src/notify.js";
import { usageOn } from "../src/services/usage.js";
import { setup } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  ctx = await setup();
});
afterAll(async () => ctx.close());

describe("satellite tiles", () => {
  it("hands signed-in people a link that works without the sign-in header, for a while", async () => {
    const asked: number[][] = [];
    const app = buildApp({
      db: ctx.db,
      authenticate: createAuthenticator({ devAuth: true, firebase: null }),
      notifier: memoryNotifier(),
      now: () => ctx.clock.now,
      materializeDays: 14,
      imagery: { key: "test-key", fetchTile: async (z, y, x) => (asked.push([z, y, x]), new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } })) },
    });
    await app.ready();
    const headers = { "x-dev-user": randomUUID(), "x-dev-name": "Dom" };

    expect((await app.inject({ method: "GET", url: "/imagery" })).statusCode).toBe(401);
    const { tiles } = JSON.parse((await app.inject({ method: "GET", url: "/imagery", headers })).body);
    expect(tiles).toMatch(/^\/imagery\/\{z\}\/\{y\}\/\{x\}\?exp=\d+&sig=/);

    const tile = await app.inject({ method: "GET", url: tiles.replace("{z}", "17").replace("{y}", "48000").replace("{x}", "34000") });
    expect(tile.statusCode).toBe(200);
    expect(tile.headers["content-type"]).toBe("image/jpeg");
    expect(asked).toEqual([[17, 48000, 34000]]);
    expect((await usageOn(ctx.db, ctx.clock.now)).imagery_tile).toBe(1);

    // A tampered link, a tile that can't exist, and an expired link are all refused without asking Esri.
    expect((await app.inject({ method: "GET", url: tiles.replace("{z}/{y}/{x}", "17/48000/34000").replace(/sig=.*/, "sig=nope") })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: tiles.replace("{z}/{y}/{x}", "2/9/0") })).statusCode).toBe(404);
    ctx.clock.now = new Date(ctx.clock.now.getTime() + 3 * 3600_000);
    expect((await app.inject({ method: "GET", url: tiles.replace("{z}/{y}/{x}", "17/48000/34000") })).statusCode).toBe(403);
    expect(asked).toHaveLength(1);
    await app.close();
  });

  it("offers no satellite view without a key", async () => {
    const dom = ctx.as(randomUUID(), "Dom");
    expect((await dom.get("/imagery")).body).toEqual({ tiles: null });
  });
});
