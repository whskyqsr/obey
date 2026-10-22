import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runJobs } from "../src/jobs.js";
import { setup } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  ctx = await setup();
});
afterAll(async () => ctx.close());

const opts = { materializeDays: 14, reminderLeadMinutes: 30 };
const lastTo = (userId: string) => [...ctx.notifier.sent].reverse().find((s) => s.userIds.includes(userId))?.push;

describe("swapping roles", () => {
  it("swaps only once the other accepts, pauses the old submissive's tasks, and swaps back when time is up", async () => {
    ctx.clock.now = new Date("2026-10-16T12:00:00Z");
    const { dom, sub, relId, domId, subId } = await ctx.pair();
    const roles = async () => Object.fromEntries((await dom.get("/me")).body.relationships[0].members.map((m: { userId: string; role: string }) => [m.userId, m.role]));
    await dom.post(`/relationships/${relId}/tasks`, {
      title: "Morning check-in",
      assigneeId: subId,
      schedule: { start: "2026-10-16", rule: { freq: "daily" } },
      dueTime: "09:00",
      timezone: "America/New_York",
      missPenalty: 5,
    });

    expect((await dom.post(`/relationships/${relId}/role-swap`, { endsAt: "2026-12-01T00:00:00Z" })).status).toBe(400);
    const asked = await dom.post(`/relationships/${relId}/role-swap`, { endsAt: "2026-10-18T00:00:00Z" });
    expect(asked.status).toBe(201);
    expect(asked.body).toMatchObject({ status: "pending", requestedBy: domId, partnerId: subId, pauseTasks: true });
    expect(lastTo(subId)?.body).toMatch(/asked to swap roles/);
    expect((await sub.post(`/relationships/${relId}/role-swap`, {})).status).toBe(409);
    // Nothing changes until the other accepts, and only they can.
    expect(await roles()).toEqual({ [domId]: "dominant", [subId]: "submissive" });
    expect((await dom.post(`/relationships/${relId}/role-swap/accept`)).status).toBe(404);
    expect((await sub.post(`/relationships/${relId}/role-swap/accept`)).body).toMatchObject({ status: "active" });
    expect(await roles()).toEqual({ [domId]: "submissive", [subId]: "dominant" });
    expect((await sub.get("/me")).body.relationships[0].roleSwap).toMatchObject({ status: "active", endsAt: "2026-10-18T00:00:00.000Z" });

    // The new Dominant gives a task; the old submissive's task is out of sight and isn't missed.
    const given = (
      await sub.post(`/relationships/${relId}/tasks`, {
        title: "Foot rub",
        assigneeId: domId,
        schedule: { start: "2026-10-16", rule: { freq: "daily" } },
        dueTime: "21:30",
        timezone: "America/New_York",
      })
    ).body;
    expect(given.id).toBeDefined();
    const titles = async () => (await dom.get(`/relationships/${relId}/occurrences?from=2026-10-17&to=2026-10-17`)).body.map((o: { title: string }) => o.title).sort();
    expect(await titles()).toEqual(["Foot rub"]);
    ctx.clock.now = new Date("2026-10-17T16:00:00Z");
    await runJobs(ctx.db, ctx.notifier, ctx.clock.now, opts);
    const [checkIn] = (await dom.get(`/relationships/${relId}/occurrences?from=2026-10-17&to=2026-10-17`)).body.filter((o: { title: string }) => o.title === "Morning check-in");
    expect(checkIn.status).toBe("excused");

    // Time's up: roles go back, the swap's task stops, and the old task picks up again.
    ctx.clock.now = new Date("2026-10-18T00:01:00Z");
    await runJobs(ctx.db, ctx.notifier, ctx.clock.now, opts);
    expect(await roles()).toEqual({ [domId]: "dominant", [subId]: "submissive" });
    expect((await dom.get("/me")).body.relationships[0].roleSwap).toBeNull();
    expect(lastTo(domId)?.body).toMatch(/role swap is over/);
    expect((await dom.get(`/relationships/${relId}/tasks`)).body.map((t: { title: string }) => t.title)).toEqual(["Morning check-in"]);
    expect((await dom.get(`/relationships/${relId}/occurrences?from=2026-10-18&to=2026-10-18`)).body.map((o: { title: string }) => o.title)).toEqual(["Morning check-in"]);
  });

  it("can be declined, taken back, or ended early by either of them", async () => {
    const { dom, sub, relId, domId, subId } = await ctx.pair();
    await sub.post(`/relationships/${relId}/role-swap`, { pauseTasks: false });
    expect((await dom.del(`/relationships/${relId}/role-swap`)).status).toBe(204);
    expect(lastTo(subId)?.body).toMatch(/declined/);
    await sub.post(`/relationships/${relId}/role-swap`, {});
    await sub.del(`/relationships/${relId}/role-swap`);
    expect((await dom.get("/me")).body.relationships[0].roleSwap).toBeNull();

    // Until someone swaps back: no end time, and the one who asked can end it.
    await sub.post(`/relationships/${relId}/role-swap`, {});
    await dom.post(`/relationships/${relId}/role-swap/accept`);
    expect((await dom.get("/me")).body.relationships[0].members.find((m: { userId: string }) => m.userId === domId).role).toBe("submissive");
    expect((await sub.del(`/relationships/${relId}/role-swap`)).status).toBe(204);
    expect(lastTo(domId)?.body).toMatch(/ended the role swap/);
    expect((await dom.get("/me")).body.relationships[0].members.find((m: { userId: string }) => m.userId === domId).role).toBe("dominant");
  });
});
