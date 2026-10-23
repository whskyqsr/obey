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
  points: 10,
  schedule: { start: "2026-10-16", rule: { freq: "daily" } },
  dueTime: "21:00",
  timezone: NY,
  ...extra,
});
const lastTo = (userId: string) => [...ctx.notifier.sent].reverse().find((s) => s.userIds.includes(userId))?.push;

describe("allowance delays", () => {
  it("tell the Dominant, with the reason when they allow details, until they close the card", async () => {
    const { dom, sub, relId, domId } = await ctx.pair();
    await dom.patch(`/relationships/${relId}`, { reschedulePolicy: "allowance", weeklyDelayAllowance: 2 });
    await dom.post(`/relationships/${relId}/tasks`, task((await sub.get("/me")).body.user.id));
    const [first] = (await sub.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-16`)).body;

    expect((await sub.post(`/occurrences/${first.id}/reschedule`, { delayHours: 2, reason: "Late shift" })).body.applied).toBe(true);
    expect(lastTo(domId)).toMatchObject({ body: "Sub used a delay (1 of 2 left this week)", data: { type: "delay_used" } });

    const [card] = (await dom.get(`/relationships/${relId}/delays`)).body;
    expect(card).toMatchObject({ reason: "Late shift", left: 1, allowance: 2, items: [{ title: "Gym", fromDueAt: first.dueAt, toDueAt: "2026-10-17T03:00:00.000Z" }] });
    expect((await sub.get(`/relationships/${relId}/delays`)).body).toEqual([]);
    expect((await sub.post(`/reschedules/${card.id}/seen`)).status).toBe(403);
    await dom.post(`/reschedules/${card.id}/seen`);
    expect((await dom.get(`/relationships/${relId}/delays`)).body).toEqual([]);

    // With details on, the Dominant's push carries the sub's reason.
    await dom.patch("/me", { notifyDetails: true });
    const [second] = (await sub.get(`/relationships/${relId}/occurrences?from=2026-10-17&to=2026-10-17`)).body;
    await sub.post(`/occurrences/${second.id}/reschedule`, { delayHours: 1, reason: "Traffic" });
    expect(lastTo(domId)!.body).toBe("Sub used a delay (0 of 2 left this week): “Traffic”");
  });
});

describe("low moods", () => {
  it("say so in the push and wait for the Dominant to reply or mark them seen", async () => {
    const { dom, sub, relId, subId, domId } = await ctx.pair();
    await dom.post(`/relationships/${relId}/tasks`, task(subId, { title: "Check in", askMood: true }));
    const [a, b] = (await sub.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-17`)).body;
    expect((await sub.post(`/occurrences/${a.id}/complete`, { mood: 2, noteMd: "Rough day" })).body).toMatchObject({ mood: 2, moodSeen: false });
    expect(lastTo(domId)!.body).toBe("Sub checked in feeling low");

    expect((await sub.post(`/occurrences/${a.id}/mood-seen`)).status).toBe(403);
    // A comment from the sub doesn't count; the Dominant's reply does.
    await sub.post(`/occurrences/${a.id}/comments`, { body: "Sorry" });
    expect((await dom.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-16`)).body[0].moodSeen).toBe(false);
    await dom.post(`/occurrences/${a.id}/comments`, { body: "Call me" });
    expect((await dom.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-16`)).body[0].moodSeen).toBe(true);

    ctx.clock.now = new Date("2026-10-17T15:00:00Z");
    expect((await sub.post(`/occurrences/${b.id}/complete`, { mood: 1 })).status).toBe(200);
    ctx.clock.now = new Date("2026-10-16T12:00:00Z");
    expect(lastTo(domId)!.body).toBe("Sub checked in feeling awful");
    expect((await dom.post(`/occurrences/${b.id}/mood-seen`)).body.moodSeen).toBe(true);
  });

  it("aren't compared with last month in the monthly review", async () => {
    const { dom, sub, relId, subId } = await ctx.pair();
    await dom.post(`/relationships/${relId}/tasks`, task(subId, { title: "Check in", askMood: true }));
    const [a] = (await sub.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-16`)).body;
    await sub.post(`/occurrences/${a.id}/complete`, { mood: 4 });
    const month = (await dom.get(`/relationships/${relId}/months/2026-10`)).body;
    expect(month).not.toHaveProperty("previousMood");
    expect(month.moods).toEqual([{ at: "2026-10-16T12:00:00.000Z", mood: 4 }]);
  });
});

describe("reminders", () => {
  it("come in the Dominant's words for a sub who allows details, or not at all", async () => {
    const { dom, sub, relId, subId } = await ctx.pair();
    expect((await dom.post(`/relationships/${relId}/tasks`, task(subId, { reminder: "custom" }))).status).toBe(400);
    const own = (await dom.post(`/relationships/${relId}/tasks`, task(subId, { title: "Lines", reminder: "custom", reminderText: " Lines, pet. Neatly. " }))).body;
    expect(own).toMatchObject({ reminder: "custom", reminderText: "Lines, pet. Neatly." });
    await dom.post(`/relationships/${relId}/tasks`, task(subId, { title: "Quiet", dueTime: "21:10", reminder: "none", reminderText: "ignored" }));
    // Switching away from custom drops the words.
    expect((await dom.patch(`/tasks/${own.id}`, { reminder: "default" })).body.reminderText).toBeNull();
    await dom.patch(`/tasks/${own.id}`, { reminder: "custom", reminderText: "Lines, pet. Neatly." });

    const before = ctx.notifier.sent.length;
    ctx.clock.now = new Date("2026-10-17T00:45:00Z");
    try {
      await runJobs(ctx.db, ctx.notifier, ctx.clock.now, opts);
      const mine = ctx.notifier.sent.slice(before).filter((s) => s.userIds.includes(subId) && s.push.data?.type === "reminder");
      // Details are off by default, so the lock screen stays discreet; "No reminder" sends nothing.
      expect(mine.map((s) => s.push.body)).toEqual(["A task is due soon"]);

      await sub.patch("/me", { notifyDetails: true });
      expect((await dom.get("/me")).body.relationships[0].members.find((m: { userId: string }) => m.userId === subId).notifyDetails).toBe(true);
      ctx.clock.now = new Date("2026-10-18T00:45:00Z");
      const mark = ctx.notifier.sent.length;
      await runJobs(ctx.db, ctx.notifier, ctx.clock.now, opts);
      const now = ctx.notifier.sent.slice(mark).filter((s) => s.userIds.includes(subId) && s.push.data?.type === "reminder");
      expect(now.map((s) => s.push.body)).toEqual(["Lines, pet. Neatly."]);
    } finally {
      ctx.clock.now = new Date("2026-10-16T12:00:00Z");
    }
  });
});

describe("telling the Dominant I'm home", () => {
  it("prompts the sub on getting home, then sends their line and starts the night's comments", async () => {
    const { dom, sub, relId, subId, domId } = await ctx.pair();
    const home = { lat: 40.7128, lng: -74.006 };
    const place = (await dom.post(`/relationships/${relId}/places`, { name: "Home", ...home })).body;
    await dom.put(`/relationships/${relId}/curfew`, { enabled: true, assigneeId: subId, placeId: place.id, time: "22:00", until: "06:00", timezone: NY, reportHome: true });
    const night = (await sub.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-16&curfew=include`)).body.find((o: { curfew: boolean }) => o.curfew);
    try {
      ctx.clock.now = new Date("2026-10-17T01:15:00Z");
      await sub.put("/me/location", { status: "ready" });
      expect((await sub.post(`/occurrences/${night.id}/tell-home`, {})).status).toBe(409);
      await sub.post(`/occurrences/${night.id}/arrive`, { kind: "enter", ...home, accuracyM: 30 });
      expect(lastTo(subId)).toMatchObject({ body: "You're home. Tell Dom?", data: { type: "curfew_arrived" } });
      expect((await dom.get(`/relationships/${relId}/curfew`)).body.night).toMatchObject({ reportHome: true, toldAt: null });

      expect((await dom.post(`/occurrences/${night.id}/tell-home`, {})).status).toBe(403);
      expect((await sub.post(`/occurrences/${night.id}/tell-home`, { note: "Home safe, Sir" })).body.commentCount).toBe(1);
      expect(lastTo(domId)).toMatchObject({ body: "Sub is home", data: { type: "curfew_home" } });
      expect((await dom.get(`/relationships/${relId}/curfew`)).body.night).toMatchObject({ toldAt: "2026-10-17T01:15:00.000Z", toldNote: "Home safe, Sir" });
      expect((await dom.get(`/occurrences/${night.id}/comments`)).body).toMatchObject([{ authorId: subId, body: "Home safe, Sir" }]);
      expect((await sub.post(`/occurrences/${night.id}/tell-home`, {})).status).toBe(409);

      // Without a phone that checks, the "I'm home" tap tells them too.
      ctx.clock.now = new Date("2026-10-18T01:15:00Z");
      await sub.put("/me/location", { status: "denied" });
      await dom.patch("/me", { notifyDetails: true });
      const sat = (await sub.get(`/relationships/${relId}/occurrences?from=2026-10-17&to=2026-10-17&curfew=include`)).body.find((o: { curfew: boolean }) => o.curfew);
      await sub.post(`/occurrences/${sat.id}/home`, { note: "In for the night" });
      expect(lastTo(domId)!.body).toBe("Sub is home: “In for the night”");
    } finally {
      ctx.clock.now = new Date("2026-10-16T12:00:00Z");
    }
  });
});

describe("redeemed rewards", () => {
  it("spend points at once and wait for the Dominant to mark them redeemed", async () => {
    const { dom, sub, relId, subId } = await ctx.pair();
    const reward = (await dom.post(`/relationships/${relId}/rewards`, { title: "Extra screen time", cost: 20 })).body;
    await dom.post(`/relationships/${relId}/ledger/adjust`, { userId: subId, delta: 30, note: "Good week" });
    const spent = (await sub.post(`/rewards/${reward.id}/redeem`)).body;
    expect(spent).toMatchObject({ kind: "redemption", rewardId: reward.id, redeemedAt: null });
    expect((await sub.get(`/relationships/${relId}/balances`)).body[0].balance).toBe(10);

    expect((await sub.post(`/ledger/${spent.id}/redeemed`, {})).status).toBe(403);
    const done = (await dom.post(`/ledger/${spent.id}/redeemed`, { note: "Enjoy it" })).body;
    expect(done).toMatchObject({ redeemNote: "Enjoy it", redeemedAt: "2026-10-16T12:00:00.000Z" });
    expect(lastTo(subId)).toMatchObject({ body: "Dom redeemed your reward", data: { type: "reward_honored" } });
    expect((await dom.post(`/ledger/${spent.id}/redeemed`, {})).status).toBe(409);
  });

  it("can get the sub out of a consequence they pick, excused once marked redeemed", async () => {
    const { dom, sub, relId, subId } = await ctx.pair();
    const pass = (await dom.post(`/relationships/${relId}/rewards`, { title: "Get out of a punishment", cost: 50, letsOff: true })).body;
    expect(pass.letsOff).toBe(true);
    const c = (await dom.post(`/relationships/${relId}/consequences`, { title: "Write lines" })).body;
    const given = (await dom.post(`/consequences/${c.id}/assign`, { assigneeId: subId, date: "2026-10-17", dueTime: "20:00", timezone: "UTC" })).body;
    await dom.post(`/relationships/${relId}/tasks`, task(subId));
    const occ = (await sub.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-17`)).body;
    const lines = occ.find((o: { seriesId: string }) => o.seriesId === given.id);
    const gym = occ.find((o: { seriesId: string }) => o.seriesId !== given.id);
    expect(lines.consequence).toBe(true);
    await dom.post(`/relationships/${relId}/ledger/adjust`, { userId: subId, delta: 120, note: "Saved up" });

    expect((await sub.post(`/rewards/${pass.id}/redeem`, {})).status).toBe(400);
    expect((await sub.post(`/rewards/${pass.id}/redeem`, { consequenceOccurrenceId: gym.id })).status).toBe(400);
    const spent = (await sub.post(`/rewards/${pass.id}/redeem`, { consequenceOccurrenceId: lines.id })).body;
    expect((await sub.post(`/rewards/${pass.id}/redeem`, { consequenceOccurrenceId: lines.id })).status).toBe(409);
    expect((await sub.get(`/relationships/${relId}/balances`)).body[0].balance).toBe(70);

    await dom.post(`/ledger/${spent.id}/redeemed`, {});
    const after = (await sub.get(`/relationships/${relId}/occurrences?from=2026-10-17&to=2026-10-17`)).body.find((o: { id: string }) => o.id === lines.id);
    expect(after.status).toBe("excused");
  });

  it("refunds a let-off reward when the consequence gets done before it's marked redeemed", async () => {
    const { dom, sub, relId, subId } = await ctx.pair();
    const pass = (await dom.post(`/relationships/${relId}/rewards`, { title: "Get out of a punishment", cost: 50, letsOff: true })).body;
    const c = (await dom.post(`/relationships/${relId}/consequences`, { title: "Write lines" })).body;
    const given = (await dom.post(`/consequences/${c.id}/assign`, { assigneeId: subId, date: "2026-10-17", dueTime: "20:00", timezone: "UTC" })).body;
    const lines = (await sub.get(`/relationships/${relId}/occurrences?from=2026-10-17&to=2026-10-17`)).body.find(
      (o: { seriesId: string }) => o.seriesId === given.id,
    );
    await dom.post(`/relationships/${relId}/ledger/adjust`, { userId: subId, delta: 120, note: "Saved up" });
    const spent = (await sub.post(`/rewards/${pass.id}/redeem`, { consequenceOccurrenceId: lines.id })).body;
    expect((await sub.get(`/relationships/${relId}/balances`)).body[0].balance).toBe(70);

    expect((await sub.post(`/occurrences/${lines.id}/complete`, {})).status).toBe(200);
    expect((await sub.get(`/relationships/${relId}/balances`)).body[0].balance).toBe(120);
    const ledger = (await dom.get(`/relationships/${relId}/ledger`)).body;
    expect(ledger.some((e: { kind: string }) => e.kind === "redemption")).toBe(false);
    expect((await dom.post(`/ledger/${spent.id}/redeemed`, {})).status).toBe(404);
  });
});
