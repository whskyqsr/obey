import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runJobs } from "../src/jobs.js";
import { setup } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  ctx = await setup();
});
afterAll(async () => ctx.close());

const NY = "America/New_York";
const opts = { materializeDays: 14, reminderLeadMinutes: 30 };
const task = (assigneeId: string, extra: object = {}) => ({
  title: "Gym",
  assigneeId,
  schedule: { start: "2026-10-16", rule: { freq: "daily" } },
  dueTime: "21:00",
  timezone: NY,
  ...extra,
});
const to = (userId: string, from = 0) => ctx.notifier.sent.slice(from).filter((s) => s.userIds.includes(userId));
const lastTo = (userId: string) => to(userId).at(-1)?.push;

async function at(iso: string, run: () => Promise<void>) {
  ctx.clock.now = new Date(iso);
  try {
    await run();
  } finally {
    ctx.clock.now = new Date("2026-10-16T12:00:00Z");
  }
}

describe("grouped notifications", () => {
  it("remind about untimed tasks once in the evening, and report misses as one push each", async () => {
    const { dom, relId, subId, domId } = await ctx.pair();
    for (const title of ["Water", "Stretch", "Read"]) await dom.post(`/relationships/${relId}/tasks`, task(subId, { title, dueTime: null }));

    // 7:30 PM in New York: too early for the evening reminder.
    let mark = ctx.notifier.sent.length;
    await at("2026-10-16T23:30:00Z", () => runJobs(ctx.db, ctx.notifier, ctx.clock.now, opts).then(() => {}));
    expect(to(subId, mark).filter((s) => s.push.data?.type === "reminder")).toEqual([]);

    // Just after 8 PM: one reminder for all three.
    mark = ctx.notifier.sent.length;
    await at("2026-10-17T00:01:00Z", () => runJobs(ctx.db, ctx.notifier, ctx.clock.now, opts).then(() => {}));
    expect(to(subId, mark).map((s) => s.push.body)).toEqual(["3 tasks are still to do today"]);

    // After midnight: one miss push each, naming the submissive for the Dominant.
    mark = ctx.notifier.sent.length;
    await at("2026-10-17T04:01:00Z", () => runJobs(ctx.db, ctx.notifier, ctx.clock.now, opts).then(() => {}));
    expect(to(subId, mark).filter((s) => s.push.data?.type === "occurrence_missed").map((s) => s.push.body)).toEqual(["You missed 3 tasks"]);
    expect(to(domId, mark).filter((s) => s.push.data?.type === "occurrence_missed").map((s) => s.push.body)).toEqual(["Sub missed 3 tasks"]);
  });

  it("count unseen rule changes in one notification that replaces the last", async () => {
    const { dom, sub, relId, subId } = await ctx.pair();
    await dom.post(`/relationships/${relId}/rules`, { title: "Stay hydrated" });
    expect(lastTo(subId)).toMatchObject({ body: "Dom added a rule", tag: `library:${relId}` });
    await dom.post(`/relationships/${relId}/rules`, { title: "Kneel when asked" });
    await dom.post(`/relationships/${relId}/protocols`, { title: "64 oz a day" });
    expect(lastTo(subId)).toMatchObject({ body: "Dom made 3 changes to rules and protocols", tag: `library:${relId}` });
    // Once they've looked, it starts over.
    const seen = (await sub.get(`/relationships/${relId}/library-changes`)).body.map((c: { id: string }) => c.id);
    await sub.post(`/relationships/${relId}/library-changes/seen`, { ids: seen });
    await dom.post(`/relationships/${relId}/rules`, { title: "Ask first" });
    expect(lastTo(subId)?.body).toBe("Dom added a rule");
  });

  it("tag a plan's notifications so the latest replaces the rest", async () => {
    const { dom, sub, relId, subId } = await ctx.pair();
    const plan = (await dom.post(`/relationships/${relId}/events`, { title: "Dinner", startsAt: "2026-10-17T22:00:00Z", endsAt: "2026-10-18T01:00:00Z" })).body;
    expect(lastTo(subId)).toMatchObject({ body: "Dom added a plan on the calendar", tag: `plan:${plan.id}` });
    void sub;
  });

  it("tells the Dominant when location is lost and back, as one replacing notification", async () => {
    const { dom, sub, relId, subId, domId } = await ctx.pair();
    const place = (await dom.post(`/relationships/${relId}/places`, { name: "Home", lat: 40.7, lng: -74, radiusM: 100 })).body;
    await dom.post(`/relationships/${relId}/tasks`, task(subId, { placeId: place.id }));
    await sub.put("/me/location", { status: "ready" });
    await sub.put("/me/location", { status: "denied" });
    expect(lastTo(domId)).toMatchObject({ body: "Sub's phone can't check location tasks right now", tag: `location:${relId}:${subId}` });
    await sub.put("/me/location", { status: "ready" });
    expect(lastTo(domId)).toMatchObject({ body: "Sub's phone can check location tasks again", tag: `location:${relId}:${subId}` });
    await sub.put(`/relationships/${relId}/location/pause`, { until: null });
    expect(lastTo(domId)?.body).toBe("Sub paused location");
    await sub.del(`/relationships/${relId}/location/pause`);
    expect(lastTo(domId)).toMatchObject({ body: "Sub turned location back on", tag: `location:${relId}:${subId}` });
  });
});

describe("notification fixes", () => {
  it("never mutes a low check-in along with completions", async () => {
    const { dom, sub, relId, subId, domId } = await ctx.pair();
    await dom.patch("/me", { mutedNotifications: ["completions"] });
    await dom.post(`/relationships/${relId}/tasks`, task(subId, { title: "Morning", askMood: true }));
    await dom.post(`/relationships/${relId}/tasks`, task(subId, { title: "Evening", askMood: true }));
    const [a, b] = (await sub.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-16`)).body;
    const mark = ctx.notifier.sent.length;
    await sub.post(`/occurrences/${a.id}/complete`, { mood: 4 });
    expect(to(domId, mark)).toEqual([]);
    await sub.post(`/occurrences/${b.id}/complete`, { mood: 1 });
    expect(lastTo(domId)).toMatchObject({ body: "Sub checked in feeling awful", data: { type: "mood_low" } });
  });

  it("keeps titles off the lock screen unless partners' words are on", async () => {
    const { dom, sub, relId, subId, domId } = await ctx.pair();
    await dom.post(`/relationships/${relId}/tasks`, task(subId, { title: "Snacks", countMax: 1 }));
    const [o] = (await sub.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-16`)).body;
    expect((await sub.post(`/occurrences/${o.id}/count`, { by: 2 })).body.status).toBe("missed");
    expect(lastTo(domId)?.body).toBe("Sub went over on a task");
    await sub.patch("/me", { notifyDetails: true });
    await dom.post(`/relationships/${relId}/tasks`, task(subId, { title: "Lines", approvalRequired: true }));
    const lines = (await sub.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-16`)).body.find((x: { title: string }) => x.title === "Lines");
    await sub.post(`/occurrences/${lines.id}/complete`);
    await dom.post(`/occurrences/${lines.id}/review`, { approve: false, comment: "Neater, please" });
    expect(lastTo(subId)?.body).toBe("Dom sent your task back: “Neater, please”");
  });

  it("tells everyone already in the dynamic when someone joins, not only Dominants", async () => {
    const sub = ctx.as(randomUUID(), "Sub");
    const dom = ctx.as(randomUUID(), "Dom");
    const rel = (await sub.post("/relationships", { name: "Us", role: "submissive" })).body;
    const invite = (await sub.post(`/relationships/${rel.id}/invites`)).body;
    await dom.post("/relationships/join", { code: invite.code, role: "dominant" });
    const subId = (await sub.get("/me")).body.user.id;
    expect(lastTo(subId)?.body).toBe("Dom joined");
  });
});
