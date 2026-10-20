import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { initialDisplayName } from "../src/auth.js";
import { runJobs } from "../src/jobs.js";
import { fcmMessages } from "../src/notify.js";
import { setup } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  ctx = await setup();
});
afterAll(async () => ctx.close());

const NY = "America/New_York";
const task = (assigneeId: string, extra: object = {}) => ({
  title: "Kneel and write lines",
  assigneeId,
  points: 10,
  schedule: { start: "2026-10-16", rule: { freq: "daily", interval: 3 } },
  dueTime: "21:00",
  timezone: NY,
  ...extra,
});

describe("relationships", () => {
  it("starts new accounts with just a first name", () => {
    expect(initialDisplayName("Jane Q. Doe", "jane@example.com")).toBe("Jane");
    expect(initialDisplayName(undefined, "jane@example.com")).toBe("jane");
    expect(initialDisplayName("  ", undefined)).toBe("Partner");
  });

  it("pairs partners through an invite code", async () => {
    const { dom, relId } = await ctx.pair();
    const me = (await dom.get("/me")).body;
    expect(me.relationships[0].id).toBe(relId);
    expect(me.relationships[0].members.map((m: { role: string }) => m.role).sort()).toEqual(["dominant", "submissive"]);
  });

  it("rejects unauthenticated requests and hides other relationships", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/me" });
    expect(res.statusCode).toBe(401);
    const a = await ctx.pair();
    const b = await ctx.pair();
    expect((await b.dom.get(`/relationships/${a.relId}/tasks`)).status).toBe(404);
  });

  it("allows PATCH and DELETE from browsers", async () => {
    const res = await ctx.app.inject({
      method: "OPTIONS",
      url: "/me",
      headers: { origin: "https://app.example.com", "access-control-request-method": "PATCH" },
    });
    expect(res.headers["access-control-allow-methods"]).toContain("PATCH");
    expect(res.headers["access-control-allow-methods"]).toContain("DELETE");
  });

  it("lets people change their display name", async () => {
    const { dom, relId, domId } = await ctx.pair();
    expect((await dom.patch("/me", { displayName: "  Sir  " })).body.displayName).toBe("Sir");
    const me = (await dom.get("/me")).body;
    expect(me.user.displayName).toBe("Sir");
    expect(me.relationships.find((r: { id: string }) => r.id === relId).members.find((m: { userId: string }) => m.userId === domId).displayName).toBe("Sir");
    expect((await dom.patch("/me", { displayName: "   " })).status).toBe(400);
  });

  it("doesn't need a name for a relationship", async () => {
    const dom = ctx.as(crypto.randomUUID());
    const rel = (await dom.post("/relationships", { role: "dominant" })).body;
    expect(rel.name).toBeNull();
    expect((await dom.patch(`/relationships/${rel.id}`, { name: " Us " })).body.name).toBe("Us");
    expect((await dom.patch(`/relationships/${rel.id}`, { name: "" })).body.name).toBeNull();
  });

  it("stores profile pictures and shows them only to partners", async () => {
    const { dom, sub, relId, domId } = await ctx.pair();
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    const put = await ctx.app.inject({
      method: "PUT",
      url: "/me/avatar",
      payload: jpeg,
      headers: { ...dom.headers, "content-type": "image/jpeg" },
    });
    expect(put.statusCode).toBe(200);
    const version = put.json().avatarVersion;
    expect(version).toBeTruthy();
    const member = (await sub.get("/me")).body.relationships.find((r: { id: string }) => r.id === relId).members.find((m: { userId: string }) => m.userId === domId);
    expect(member.avatarVersion).toBe(version);

    const fetchAs = (who: typeof dom) => ctx.app.inject({ method: "GET", url: `/users/${domId}/avatar?v=${version}`, headers: who.headers });
    const got = await fetchAs(sub);
    expect(got.statusCode).toBe(200);
    expect(got.headers["content-type"]).toBe("image/jpeg");
    expect(got.rawPayload.equals(jpeg)).toBe(true);
    expect((await fetchAs(ctx.as(crypto.randomUUID()))).statusCode).toBe(404);

    expect((await dom.del("/me/avatar")).body.avatarVersion).toBeNull();
    expect((await fetchAs(sub)).statusCode).toBe(404);
  });

  it("keeps invite codes single-use", async () => {
    const { dom, relId } = await ctx.pair();
    const code = (await dom.post(`/relationships/${relId}/invites`)).body.code;
    const third = ctx.as(crypto.randomUUID());
    expect((await third.post("/relationships/join", { code, role: "submissive" })).status).toBe(200);
    const fourth = ctx.as(crypto.randomUUID());
    expect((await fourth.post("/relationships/join", { code, role: "submissive" })).status).toBe(404);
  });
});

describe("tasks and occurrences", () => {
  it("only lets Dominants create tasks", async () => {
    const { sub, relId, subId } = await ctx.pair();
    expect((await sub.post(`/relationships/${relId}/tasks`, task(subId))).status).toBe(403);
  });

  it("materialises every-3-days occurrences in the series timezone", async () => {
    const { dom, relId, subId } = await ctx.pair();
    const created = await dom.post(`/relationships/${relId}/tasks`, task(subId));
    expect(created.status).toBe(201);
    expect(created.body.summary).toBe("Every 3 days");
    const occ = (await dom.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-25`)).body;
    expect(occ.map((o: { originalDate: string }) => o.originalDate)).toEqual(["2026-10-16", "2026-10-19", "2026-10-22", "2026-10-25"]);
    expect(occ[0].dueAt).toBe("2026-10-17T01:00:00.000Z");
  });

  it("rejects invalid schedules", async () => {
    const { dom, relId, subId } = await ctx.pair();
    const bad = task(subId, { schedule: { start: "2026-10-16", rule: { freq: "daily", interval: 0 } } });
    expect((await dom.post(`/relationships/${relId}/tasks`, bad)).status).toBe(400);
  });

  it("awards points on completion exactly once", async () => {
    const { dom, sub, relId, subId } = await ctx.pair();
    await dom.post(`/relationships/${relId}/tasks`, task(subId));
    const [first] = (await sub.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-16`)).body;
    expect((await sub.post(`/occurrences/${first.id}/complete`, { noteMd: "done" })).body.status).toBe("completed");
    expect((await sub.post(`/occurrences/${first.id}/complete`)).status).toBe(409);
    const balances = (await sub.get(`/relationships/${relId}/balances`)).body;
    expect(balances).toEqual([{ userId: subId, balance: 10 }]);
    expect(ctx.notifier.sent.at(-1)!.push.body).toBe("Sub completed a task");
  });

  it("holds points until a Dominant approves when approval is required", async () => {
    const { dom, sub, relId, subId } = await ctx.pair();
    await dom.post(`/relationships/${relId}/tasks`, task(subId, { approvalRequired: true }));
    const [first] = (await sub.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-16`)).body;
    expect((await sub.post(`/occurrences/${first.id}/complete`)).body.status).toBe("submitted");
    expect((await sub.post(`/occurrences/${first.id}/review`, { approve: true })).status).toBe(403);
    expect((await dom.post(`/occurrences/${first.id}/review`, { approve: true })).body.status).toBe("completed");
    expect((await dom.get(`/relationships/${relId}/balances`)).body[0].balance).toBe(10);
  });

  it("schedules completion-anchored tasks from the completion date", async () => {
    const { dom, sub, relId, subId } = await ctx.pair();
    await dom.post(
      `/relationships/${relId}/tasks`,
      task(subId, { schedule: { start: "2026-10-16", anchor: "completion", rule: { freq: "daily", interval: 3 } } }),
    );
    const [first] = (await sub.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-30`)).body;
    ctx.clock.now = new Date("2026-10-17T15:00:00Z"); // completed a day late
    await sub.post(`/occurrences/${first.id}/complete`);
    const all = (await sub.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-30`)).body;
    expect(all.map((o: { originalDate: string }) => o.originalDate)).toEqual(["2026-10-16", "2026-10-20"]);
    ctx.clock.now = new Date("2026-10-16T12:00:00Z");
  });
});

describe("rescheduling", () => {
  async function withTask(policy: "dominant_only" | "request" | "allowance", allowance = 0) {
    const p = await ctx.pair();
    await p.dom.patch(`/relationships/${p.relId}`, { reschedulePolicy: policy, weeklyDelayAllowance: allowance });
    await p.dom.post(`/relationships/${p.relId}/tasks`, task(p.subId));
    const [first] = (await p.sub.get(`/relationships/${p.relId}/occurrences?from=2026-10-16&to=2026-10-16`)).body;
    return { ...p, first };
  }

  it("lets a Dominant delay one occurrence by 24 hours", async () => {
    const { dom, relId, first } = await withTask("dominant_only");
    const res = await dom.post(`/occurrences/${first.id}/reschedule`, { scope: "this", delayHours: 24 });
    expect(res.body.applied).toBe(true);
    expect(res.body.occurrence.dueAt).toBe("2026-10-18T01:00:00.000Z");
    expect(res.body.occurrence.rescheduled).toBe(true);
    // The rest of the series is untouched.
    const next = (await dom.get(`/relationships/${relId}/occurrences?from=2026-10-19&to=2026-10-19`)).body;
    expect(next[0].dueAt).toBe("2026-10-20T01:00:00.000Z");
  });

  it("sets a brand-new deadline", async () => {
    const { dom, first } = await withTask("dominant_only");
    const res = await dom.post(`/occurrences/${first.id}/reschedule`, { dueAt: "2026-10-18T14:30:00Z" });
    expect(res.body.occurrence.dueAt).toBe("2026-10-18T14:30:00.000Z");
  });

  it("refuses submissives under dominant_only", async () => {
    const { sub, first } = await withTask("dominant_only");
    expect((await sub.post(`/occurrences/${first.id}/reschedule`, { delayHours: 24 })).status).toBe(403);
  });

  it("turns a submissive's delay into a request the Dominant approves", async () => {
    const { dom, sub, relId, first } = await withTask("request");
    const res = await sub.post(`/occurrences/${first.id}/reschedule`, { delayHours: 24, reason: "Working late" });
    expect(res.body.applied).toBe(false);
    expect(res.body.occurrence.dueAt).toBe(first.dueAt);
    const pending = (await dom.get(`/relationships/${relId}/reschedules?status=requested`)).body;
    expect(pending).toHaveLength(1);
    expect((await sub.post(`/reschedules/${pending[0].id}/decide`, { approve: true })).status).toBe(403);
    const decided = await dom.post(`/reschedules/${pending[0].id}/decide`, { approve: true });
    expect(decided.body.occurrence.dueAt).toBe("2026-10-18T01:00:00.000Z");
    expect(ctx.notifier.sent.at(-1)!.push.body).toBe("Your extension was approved");
  });

  it("applies delays directly within the weekly allowance", async () => {
    const { sub, relId, first } = await withTask("allowance", 1);
    expect((await sub.post(`/occurrences/${first.id}/reschedule`, { delayHours: 24 })).body.applied).toBe(true);
    const [second] = (await sub.get(`/relationships/${relId}/occurrences?from=2026-10-19&to=2026-10-19`)).body;
    expect((await sub.post(`/occurrences/${second.id}/reschedule`, { delayHours: 24 })).body.applied).toBe(false);
  });

  it("moves this and following occurrences", async () => {
    const { dom, relId, first } = await withTask("dominant_only");
    const res = await dom.post(`/occurrences/${first.id}/reschedule`, { scope: "following", delayHours: 24 });
    expect(res.body.occurrence.originalDate).toBe("2026-10-17");
    const occ = (await dom.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-26`)).body;
    expect(occ.map((o: { originalDate: string }) => o.originalDate)).toEqual(["2026-10-17", "2026-10-20", "2026-10-23", "2026-10-26"]);
    const tasks = (await dom.get(`/relationships/${relId}/tasks`)).body;
    expect(tasks).toHaveLength(1);
    expect(tasks[0].schedule.start).toBe("2026-10-17");
  });

  it("names the task on a request", async () => {
    const { dom, sub, relId, first } = await withTask("request");
    await sub.post(`/occurrences/${first.id}/reschedule`, { delayHours: 24 });
    const [req] = (await dom.get(`/relationships/${relId}/reschedules?status=requested`)).body;
    expect(req).toMatchObject({ title: "Kneel and write lines", groupId: null });
  });

  it("asks for more time on the whole day as one request", async () => {
    const { dom, sub, relId, subId } = await withTask("request");
    await dom.post(`/relationships/${relId}/tasks`, task(subId, { title: "Gym", dueTime: "18:00" }));
    const today = (await sub.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-16`)).body;
    expect(today).toHaveLength(2);
    const res = await sub.post(`/relationships/${relId}/reschedules/day`, {
      occurrenceIds: today.map((o: { id: string }) => o.id),
      delayHours: 24,
      reason: "Sick today",
    });
    expect(res.body.applied).toBe(false);
    const pending = (await dom.get(`/relationships/${relId}/reschedules?status=requested`)).body;
    expect(pending).toHaveLength(2);
    expect(new Set(pending.map((r: { groupId: string }) => r.groupId)).size).toBe(1);
    expect(pending.map((r: { title: string }) => r.title).sort()).toEqual(["Gym", "Kneel and write lines"]);
    expect(ctx.notifier.sent.at(-1)!.push.body).toBe("Sub asked for more time on 2 tasks");

    const decided = await dom.post(`/reschedules/${pending[0].id}/decide`, { approve: true });
    expect(decided.body.requests).toHaveLength(2);
    expect(decided.body.occurrences.map((o: { dueAt: string }) => o.dueAt).sort()).toEqual([
      "2026-10-17T22:00:00.000Z",
      "2026-10-18T01:00:00.000Z",
    ]);
    expect((await dom.get(`/relationships/${relId}/reschedules?status=requested`)).body).toHaveLength(0);
    expect(ctx.notifier.sent.at(-1)!.push.body).toBe("Your extension for 2 tasks was approved");
  });

  it("counts a whole-day request as one delay against the allowance", async () => {
    const { dom, sub, relId, subId } = await withTask("allowance", 1);
    await dom.post(`/relationships/${relId}/tasks`, task(subId, { title: "Gym", dueTime: "18:00" }));
    const today = (await sub.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-16`)).body;
    const res = await sub.post(`/relationships/${relId}/reschedules/day`, { occurrenceIds: today.map((o: { id: string }) => o.id), delayHours: 24 });
    expect(res.body.applied).toBe(true);
    const [next] = (await sub.get(`/relationships/${relId}/occurrences?from=2026-10-19&to=2026-10-19`)).body;
    expect((await sub.post(`/occurrences/${next.id}/reschedule`, { delayHours: 24 })).body.applied).toBe(false);
  });

  it("rejects whole-day requests for tasks in another relationship", async () => {
    const a = await withTask("request");
    const b = await withTask("request");
    const res = await a.sub.post(`/relationships/${a.relId}/reschedules/day`, { occurrenceIds: [b.first.id], delayHours: 24 });
    expect(res.status).toBe(404);
  });

  it("rejects deadlines in the past", async () => {
    const { dom, first } = await withTask("dominant_only");
    expect((await dom.post(`/occurrences/${first.id}/reschedule`, { dueAt: "2026-10-15T00:00:00Z" })).status).toBe(400);
  });
});

describe("background jobs", () => {
  it("marks missed occurrences, applies penalties, and reopening by reschedule reverses them", async () => {
    const { dom, relId, subId } = await ctx.pair();
    await dom.post(`/relationships/${relId}/tasks`, task(subId, { missPenalty: 5, graceMinutes: 60 }));
    const [first] = (await dom.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-16`)).body;

    ctx.clock.now = new Date("2026-10-17T01:30:00Z"); // 30 min past due, inside grace
    await runJobs(ctx.db, ctx.notifier, ctx.clock.now, { materializeDays: 14, reminderLeadMinutes: 30 });
    expect((await dom.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-16`)).body[0].status).toBe("pending");

    ctx.clock.now = new Date("2026-10-17T02:01:00Z");
    await runJobs(ctx.db, ctx.notifier, ctx.clock.now, { materializeDays: 14, reminderLeadMinutes: 30 });
    expect((await dom.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-16`)).body[0].status).toBe("missed");
    expect((await dom.get(`/relationships/${relId}/balances`)).body[0].balance).toBe(-5);

    const res = await dom.post(`/occurrences/${first.id}/reschedule`, { delayHours: 24 });
    expect(res.body.occurrence.status).toBe("pending");
    expect((await dom.get(`/relationships/${relId}/balances`)).body[0].balance).toBe(0);
    ctx.clock.now = new Date("2026-10-16T12:00:00Z");
  });

  it("sends one reminder per occurrence", async () => {
    const { dom, relId, subId } = await ctx.pair();
    await dom.post(`/relationships/${relId}/tasks`, task(subId));
    const now = new Date("2026-10-17T00:45:00Z"); // 15 min before 21:00 New York
    const opts = { materializeDays: 14, reminderLeadMinutes: 30 };
    const before = ctx.notifier.sent.filter((s) => s.userIds.includes(subId) && s.push.data?.type === "reminder").length;
    await runJobs(ctx.db, ctx.notifier, now, opts);
    await runJobs(ctx.db, ctx.notifier, now, opts);
    const after = ctx.notifier.sent.filter((s) => s.userIds.includes(subId) && s.push.data?.type === "reminder").length;
    expect(after - before).toBe(1);
  });
});

describe("points, rewards and notes", () => {
  it("redeems rewards only with enough points", async () => {
    const { dom, sub, relId, subId } = await ctx.pair();
    const reward = (await dom.post(`/relationships/${relId}/rewards`, { title: "Movie night", cost: 20 })).body;
    expect((await sub.post(`/rewards/${reward.id}/redeem`)).status).toBe(409);
    await dom.post(`/relationships/${relId}/ledger/adjust`, { userId: subId, delta: 25, note: "Good week" });
    expect((await sub.post(`/rewards/${reward.id}/redeem`)).status).toBe(201);
    expect((await sub.get(`/relationships/${relId}/balances`)).body[0].balance).toBe(5);
  });

  it("keeps private notes private and partial updates partial", async () => {
    const { dom, sub, relId } = await ctx.pair();
    const priv = (await sub.post(`/relationships/${relId}/notes`, { bodyMd: "# Mine", visibility: "private", tags: ["a"] })).body;
    await sub.post(`/relationships/${relId}/notes`, { bodyMd: "Shared" });
    expect((await dom.get(`/relationships/${relId}/notes`)).body).toHaveLength(1);
    expect((await dom.patch(`/notes/${priv.id}`, { title: "x" })).status).toBe(404);
    const updated = (await sub.patch(`/notes/${priv.id}`, { title: "Title" })).body;
    expect(updated).toMatchObject({ title: "Title", visibility: "private", tags: ["a"], bodyMd: "# Mine" });
  });

  it("lets only Dominants edit the rule book", async () => {
    const { dom, sub, relId } = await ctx.pair();
    expect((await sub.post(`/relationships/${relId}/rules`, { title: "Ask first" })).status).toBe(403);
    const rule = (await dom.post(`/relationships/${relId}/rules`, { title: "Ask first", position: 2 })).body;
    const patched = (await dom.patch(`/rules/${rule.id}`, { category: "Protocol" })).body;
    expect(patched).toMatchObject({ title: "Ask first", position: 2, category: "Protocol" });
  });
});

describe("task history", () => {
  it("lists finished occurrences and lets a Dominant correct them, rebooking points", async () => {
    const { dom, sub, relId, subId } = await ctx.pair();
    const t = (await dom.post(`/relationships/${relId}/tasks`, task(subId, { points: 10, missPenalty: 4, schedule: { start: "2026-10-16", rule: { freq: "daily" } } }))).body;
    await dom.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-18`);
    const balance = async () =>
      ((await sub.get(`/relationships/${relId}/balances`)).body.find((b: { userId: string }) => b.userId === subId)?.balance ?? 0) as number;
    try {
      ctx.clock.now = new Date("2026-10-17T12:00:00Z"); // the 16th's 21:00 deadline has passed
      await runJobs(ctx.db, ctx.notifier, ctx.clock.now, { materializeDays: 14, reminderLeadMinutes: 30 });

      const history = (await sub.get(`/tasks/${t.id}/history`)).body;
      expect(history.map((h: { originalDate: string; status: string }) => [h.originalDate, h.status])).toEqual([["2026-10-16", "missed"]]);
      expect(history[0].pointsDelta).toBe(-4);
      const before = await balance();

      const id = history[0].id;
      expect((await sub.patch(`/occurrences/${id}`, { status: "completed" })).status).toBe(403);
      const fixed = await dom.patch(`/occurrences/${id}`, { status: "completed", completedAt: "2026-10-16T22:30:00-04:00" });
      expect(fixed.status).toBe(200);
      expect(await balance()).toBe(before + 4 + 10);

      const [after] = (await sub.get(`/tasks/${t.id}/history`)).body;
      expect(after).toMatchObject({ status: "completed", pointsDelta: 10, completedAt: "2026-10-17T02:30:00.000Z" });
      expect(after.editedBy).toBeTruthy();

      await dom.patch(`/occurrences/${id}`, { status: "excused" });
      expect(await balance()).toBe(before + 4);
      expect((await dom.patch(`/occurrences/${id}`, { status: "pending" })).status).toBe(400);
    } finally {
      ctx.clock.now = new Date("2026-10-16T12:00:00Z");
    }
  });
});

describe("feature switches", () => {
  it("merges switches and stops booking points when points are off", async () => {
    const { dom, sub, relId, subId } = await ctx.pair();
    expect((await dom.get("/me")).body.relationships.find((r: { id: string }) => r.id === relId).features).toEqual({
      points: true,
      consequences: true,
      rules: true,
      notes: true,
      journal: true,
    });
    expect((await sub.patch(`/relationships/${relId}`, { features: { points: false } })).status).toBe(403);
    await dom.patch(`/relationships/${relId}`, { features: { points: false } });
    const rel = (await dom.patch(`/relationships/${relId}`, { features: { journal: false } })).body;
    expect(rel.features).toMatchObject({ points: false, journal: false, consequences: true });

    await dom.post(`/relationships/${relId}/tasks`, task(subId, { points: 10, schedule: { start: "2026-10-16" } }));
    const [occ] = (await sub.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-16`)).body;
    expect((await sub.post(`/occurrences/${occ.id}/complete`)).body.status).toBe("completed");
    expect((await sub.get(`/relationships/${relId}/balances`)).body).toEqual([]);
    expect((await dom.post(`/relationships/${relId}/ledger/adjust`, { userId: subId, delta: 5, note: "x" })).status).toBe(409);
  });
});

describe("push payloads", () => {
  it("sends Android data only, so the app titles it with the discreet-mode name", () => {
    const [web, android] = fcmMessages(
      [
        { token: "w", platform: "web" },
        { token: "a", platform: "android" },
      ],
      { title: "Obey", body: "A task is due soon", data: { type: "reminder" } },
    );
    expect(web).toMatchObject({ tokens: ["w"], notification: { title: "Obey", body: "A task is due soon" } });
    expect(android).toEqual({ tokens: ["a"], data: { type: "reminder", body: "A task is due soon" }, android: { priority: "high" } });
  });
});
