import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runJobs } from "../src/jobs.js";
import { setup } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  ctx = await setup();
});
afterAll(async () => ctx.close());

const opts = { materializeDays: 14, reminderLeadMinutes: 30 };
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 7, 7, 0xff, 0xd9]);

describe("keeping proof photos for a set time", () => {
  it("lets either partner choose, and deletes photos that many days after the task is settled, unless reported", async () => {
    ctx.clock.now = new Date("2026-10-22T12:00:00Z");
    const { dom, sub, relId, subId } = await ctx.pair();
    expect((await dom.get("/me")).body.relationships[0].proofDays).toBeNull();
    // A sub can set how long their photos are kept, though not anything else about the dynamic.
    expect((await sub.patch(`/relationships/${relId}`, { proofDays: 7, subNotes: false })).status).toBe(403);
    expect((await sub.patch(`/relationships/${relId}`, { proofDays: 7 })).body.proofDays).toBe(7);

    await dom.post(`/relationships/${relId}/tasks`, {
      title: "Outfit photo",
      assigneeId: subId,
      schedule: { start: "2026-10-22" },
      dueTime: "21:00",
      timezone: "America/New_York",
    });
    await dom.post(`/relationships/${relId}/tasks`, {
      title: "Second photo",
      assigneeId: subId,
      schedule: { start: "2026-10-22" },
      dueTime: "22:00",
      timezone: "America/New_York",
    });
    const occs = (await sub.get(`/relationships/${relId}/occurrences?from=2026-10-22&to=2026-10-22`)).body as { id: string }[];
    await sub.post("/me/proof-terms", { adult: true, rules: true });
    const add = async (occId: string) =>
      (await ctx.app.inject({ method: "POST", url: `/occurrences/${occId}/photos`, payload: jpeg, headers: { ...sub.headers, "content-type": "image/jpeg" } })).json().id as string;
    const kept = await add(occs[0]!.id);
    const reported = await add(occs[1]!.id);
    for (const o of occs) await sub.post(`/occurrences/${o.id}/complete`);
    await dom.post("/reports", { subjectId: subId, photoId: reported, reason: "other" });

    const photo = (id: string) => ctx.app.inject({ method: "GET", url: `/photos/${id}`, headers: dom.headers });
    ctx.clock.now = new Date("2026-10-29T11:00:00Z");
    await runJobs(ctx.db, ctx.notifier, ctx.clock.now, opts);
    expect((await photo(kept)).statusCode).toBe(200);

    ctx.clock.now = new Date("2026-10-29T13:00:00Z");
    await runJobs(ctx.db, ctx.notifier, ctx.clock.now, opts);
    expect((await photo(kept)).statusCode).toBe(404);
    // The reported one waits for a moderator.
    expect((await photo(reported)).statusCode).toBe(200);
    const after = (await dom.get(`/relationships/${relId}/occurrences?from=2026-10-22&to=2026-10-22`)).body as { id: string; photoCount: number }[];
    expect(after.find((o) => o.id === occs[0]!.id)!.photoCount).toBe(0);
    expect(after.find((o) => o.id === occs[1]!.id)!.photoCount).toBe(1);

    // Keeping them again is just null.
    expect((await sub.patch(`/relationships/${relId}`, { proofDays: null })).body.proofDays).toBeNull();
  });
});
