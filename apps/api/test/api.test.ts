import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { initialDisplayName } from "../src/auth.js";
import { runJobs } from "../src/jobs.js";
import { fcmMessages, isQuiet } from "../src/notify.js";
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

  it("lists this account's push devices and sends a test", async () => {
    const { dom, domId } = await ctx.pair();
    expect((await dom.get("/me/devices")).body).toEqual([]);
    expect((await dom.post("/devices", { token: "web-token-0123456789abc", platform: "web" })).status).toBe(204);
    const sent = await dom.post("/me/test-push", {});
    expect(sent.body).toEqual([{ platform: "web", tokenTail: "0123456789abc".slice(-12), registeredAt: expect.any(String), lastSentAt: null, lastError: null }]);
    expect(ctx.notifier.sent.at(-1)).toMatchObject({ userIds: [domId], push: { data: { type: "test" } } });
  });

  it("lets people change their display name", async () => {
    const { dom, relId, domId } = await ctx.pair();
    expect((await dom.patch("/me", { displayName: "  Sir  " })).body.displayName).toBe("Sir");
    const me = (await dom.get("/me")).body;
    expect(me.user.displayName).toBe("Sir");
    expect(me.relationships.find((r: { id: string }) => r.id === relId).members.find((m: { userId: string }) => m.userId === domId).displayName).toBe("Sir");
    expect((await dom.patch("/me", { displayName: "   " })).status).toBe(400);
  });

  it("keeps a week start per person, Sunday by default", async () => {
    const { dom, sub } = await ctx.pair();
    expect((await dom.get("/me")).body.user.weekStart).toBe("sun");
    expect((await dom.patch("/me", { weekStart: "mon" })).body).toMatchObject({ weekStart: "mon", displayName: "Dom" });
    expect((await dom.get("/me")).body.user.weekStart).toBe("mon");
    expect((await sub.get("/me")).body.user.weekStart).toBe("sun");
    expect((await dom.patch("/me", { weekStart: "wed" })).status).toBe(400);
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
  it("lets an invite link set the role and preview who sent it", async () => {
    const { dom, relId } = await ctx.pair();
    const inv = (await dom.post(`/relationships/${relId}/invites`)).body;
    expect(inv.role).toBe("submissive");
    const guest = ctx.as(crypto.randomUUID());
    const preview = (await guest.get(`/invites/${inv.code.toLowerCase()}`)).body;
    expect(preview).toMatchObject({ code: inv.code, relationshipId: relId, role: "submissive", alreadyMember: false });
    expect(preview.inviterName).toBeTruthy();
    // The invite decides the role, whatever the joiner sends.
    const joined = (await guest.post("/relationships/join", { code: inv.code, role: "dominant" })).body;
    expect(joined.members.filter((m: { role: string }) => m.role === "submissive")).toHaveLength(2);
    expect((await guest.get(`/invites/${inv.code}`)).status).toBe(404);

    const open = (await dom.post(`/relationships/${relId}/invites`, { role: null })).body;
    expect(open.role).toBeNull();
    const chooser = ctx.as(crypto.randomUUID());
    expect((await chooser.post("/relationships/join", { code: open.code })).status).toBe(400);
    expect((await chooser.post("/relationships/join", { code: open.code, role: "switch" })).status).toBe(200);
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

  it("doesn't let a sub complete a daily task before its day", async () => {
    const { dom, sub, relId, subId } = await ctx.pair();
    await dom.post(`/relationships/${relId}/tasks`, task(subId, { schedule: { start: "2026-10-16", rule: { freq: "daily" } } }));
    const [today, tomorrow] = (await sub.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-17`)).body;
    expect([today.opensOn, tomorrow.opensOn]).toEqual([null, "2026-10-17"]);
    expect((await sub.post(`/occurrences/${tomorrow.id}/complete`)).status).toBe(409);
    expect((await sub.post(`/occurrences/${today.id}/complete`)).body.status).toBe("completed");
    expect((await dom.post(`/occurrences/${tomorrow.id}/complete`)).body.status).toBe("completed");
  });

  it("lets the assignee undo a completion moments later, taking its points back", async () => {
    const { dom, sub, relId, subId } = await ctx.pair();
    await dom.post(`/relationships/${relId}/tasks`, task(subId));
    const [first] = (await sub.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-16`)).body;
    await sub.post(`/occurrences/${first.id}/complete`);
    const undone = await sub.post(`/occurrences/${first.id}/undo`);
    expect(undone.body).toMatchObject({ status: "pending", completedAt: null });
    expect((await sub.get(`/relationships/${relId}/balances`)).body).toEqual([]);
    expect((await sub.post(`/occurrences/${first.id}/undo`)).status).toBe(409);
    await sub.post(`/occurrences/${first.id}/complete`);
    try {
      ctx.clock.now = new Date(ctx.clock.now.getTime() + 11 * 60_000);
      expect((await sub.post(`/occurrences/${first.id}/undo`)).status).toBe(409);
      expect((await dom.post(`/occurrences/${first.id}/undo`)).body.status).toBe("pending");
    } finally {
      ctx.clock.now = new Date("2026-10-16T12:00:00Z");
    }
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

  it("keeps comments on an occurrence, including the reason a task was sent back", async () => {
    const { dom, sub, relId, subId, domId } = await ctx.pair();
    await dom.post(`/relationships/${relId}/tasks`, task(subId, { approvalRequired: true }));
    const [first] = (await sub.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-16`)).body;
    const c = await sub.post(`/occurrences/${first.id}/comments`, { body: "  Running a little late  " });
    expect(c.body).toMatchObject({ authorId: subId, body: "Running a little late" });
    expect(ctx.notifier.sent.at(-1)).toMatchObject({ userIds: [domId], push: { body: "Sub commented on a task" } });
    expect((await sub.post(`/occurrences/${first.id}/comments`, { body: "   " })).status).toBe(400);

    await sub.post(`/occurrences/${first.id}/complete`);
    const back = await dom.post(`/occurrences/${first.id}/review`, { approve: false, comment: "Lines were sloppy, again please" });
    expect(back.body).toMatchObject({ status: "pending", commentCount: 2 });
    const list = (await dom.get(`/occurrences/${first.id}/comments`)).body;
    expect(list.map((x: { body: string }) => x.body)).toEqual(["Running a little late", "Lines were sloppy, again please"]);

    expect((await dom.del(`/comments/${c.body.id}`)).status).toBe(403);
    expect((await sub.del(`/comments/${c.body.id}`)).status).toBe(204);
    const [after] = (await sub.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-16`)).body;
    expect(after.commentCount).toBe(1);
  });

  it("puts reports in a queue only admins with a verified email can see and resolve", async () => {
    const { dom, sub, relId, subId } = await ctx.pair();
    await dom.post(`/relationships/${relId}/tasks`, task(subId));
    const [first] = (await sub.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-16`)).body;
    await sub.post("/me/proof-terms", { adult: true, rules: true });
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 9, 0xff, 0xd9]);
    const photoId = (
      await ctx.app.inject({ method: "POST", url: `/occurrences/${first.id}/photos`, payload: jpeg, headers: { ...sub.headers, "content-type": "image/jpeg" } })
    ).json().id;
    await dom.post("/reports", { subjectId: subId, photoId, reason: "minor", details: "looks young" });

    const mod = { "x-dev-user": crypto.randomUUID(), "x-dev-email": "MOD@example.com" };
    const asMod = (method: "GET" | "POST", url: string, payload?: object) => ctx.app.inject({ method, url, payload, headers: mod });
    expect((await dom.get("/admin/reports")).status).toBe(404);
    expect((await ctx.app.inject({ method: "GET", url: "/me", headers: mod })).json().admin).toBe(true);
    const queue = (await asMod("GET", "/admin/reports")).json();
    const mine = queue.find((r: { photoId: string }) => r.photoId === photoId);
    expect(mine).toMatchObject({ reason: "minor", details: "looks young", subject: { id: subId }, photoDeleted: false, resolvedAt: null });
    expect((await asMod("GET", `/admin/photos/${photoId}`)).rawPayload.equals(jpeg)).toBe(true);

    expect((await asMod("POST", `/admin/reports/${mine.id}/resolve`, { removePhoto: true })).statusCode).toBe(200);
    expect((await asMod("GET", "/admin/reports")).json().some((r: { id: string }) => r.id === mine.id)).toBe(false);
    const all = (await asMod("GET", "/admin/reports?all=1")).json().find((r: { id: string }) => r.id === mine.id);
    expect(all).toMatchObject({ photoId: null, photoDeleted: true, resolvedAt: expect.any(String) });
    const [after] = (await dom.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-16`)).body;
    expect(after.photoCount).toBe(0);
  });

  it("ends a dynamic for both when one leaves, keeping it read-only, and blocks re-pairing", async () => {
    const { dom, sub, relId, subId, domId } = await ctx.pair();
    await dom.post(`/relationships/${relId}/tasks`, task(subId));
    const [first] = (await sub.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-16`)).body;
    await sub.post("/me/proof-terms", { adult: true, rules: true });
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
    const photo = await ctx.app.inject({ method: "POST", url: `/occurrences/${first.id}/photos`, payload: jpeg, headers: { ...sub.headers, "content-type": "image/jpeg" } });
    expect(photo.statusCode).toBe(201);

    const left = await sub.post(`/relationships/${relId}/leave`, { block: [domId, subId] });
    expect(left.body.endedAt).toEqual(expect.any(String));
    expect(left.body.endedBy).toBe(subId);
    expect(ctx.notifier.sent.at(-1)).toMatchObject({ userIds: [domId], push: { body: "Sub ended your dynamic" } });

    // Both still read it; nothing changes it any more.
    // The open task was cancelled, so it no longer lists; done and missed ones stay as history.
    expect((await dom.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-16`)).body).toEqual([]);
    expect((await ctx.app.inject({ method: "GET", url: `/photos/${photo.json().id}`, headers: dom.headers })).statusCode).toBe(404);
    expect((await sub.get(`/relationships/${relId}/tasks`)).status).toBe(200);
    expect((await dom.post(`/relationships/${relId}/tasks`, task(subId))).status).toBe(409);
    expect((await dom.post(`/relationships/${relId}/invites`)).status).toBe(409);

    // The blocked Dom can't bring the sub into a new dynamic.
    const fresh = (await dom.post("/relationships", { role: "dominant" })).body;
    const invite = (await dom.post(`/relationships/${fresh.id}/invites`)).body;
    expect((await sub.post("/relationships/join", { code: invite.code, role: "submissive" })).status).toBe(403);
    // Leaving again is harmless.
    expect((await dom.post(`/relationships/${relId}/leave`, {})).status).toBe(200);
  });

  it("deletes an account: ends shared dynamics, removes private writing, and frees the sign-in", async () => {
    const { dom, sub, relId, subId, domId } = await ctx.pair();
    await dom.post(`/relationships/${relId}/tasks`, task(subId));
    await sub.post(`/relationships/${relId}/notes`, { bodyMd: "Shared with you" });
    await sub.post(`/relationships/${relId}/notes`, { bodyMd: "Just mine", visibility: "private" });
    const solo = (await sub.post("/relationships", { role: "submissive" })).body;

    expect((await sub.del("/me")).status).toBe(204);
    expect(ctx.notifier.sent.at(-1)).toMatchObject({ userIds: [domId], push: { body: "Sub deleted their account, so your dynamic has ended" } });

    // The Dom keeps a read-only copy of what was shared, credited to a deleted account.
    const me = (await dom.get("/me")).body;
    const rel = me.relationships.find((r: { id: string }) => r.id === relId);
    expect(rel.endedAt).toEqual(expect.any(String));
    expect(rel.members.find((m: { userId: string }) => m.userId === subId).displayName).toBe("Deleted account");
    expect((await dom.get(`/relationships/${relId}/notes`)).body.map((n: { bodyMd: string }) => n.bodyMd)).toEqual(["Shared with you"]);
    expect((await dom.get(`/relationships/${solo.id}/notes`)).status).toBe(404);

    // Signing in again with the same login starts over with an empty account.
    const again = (await sub.get("/me")).body;
    expect(again.user.id).not.toBe(subId);
    expect(again.relationships).toEqual([]);
  });

  it("takes photo proof only after the rules are accepted, and lets only its owner delete it", async () => {
    const { dom, sub, relId, subId, domId } = await ctx.pair();
    await dom.post(`/relationships/${relId}/tasks`, task(subId, { proofRequired: true }));
    const [first] = (await sub.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-16`)).body;
    expect((await sub.post(`/occurrences/${first.id}/complete`)).status).toBe(409);

    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
    const upload = (who: typeof dom) =>
      ctx.app.inject({ method: "POST", url: `/occurrences/${first.id}/photos`, payload: jpeg, headers: { ...who.headers, "content-type": "image/jpeg" } });
    expect((await upload(sub)).statusCode).toBe(403);
    expect((await sub.post("/me/proof-terms", { adult: true, rules: false })).status).toBe(400);
    expect((await sub.post("/me/proof-terms", { adult: true, rules: true })).body.proofTermsAccepted).toBe(true);
    const added = await upload(sub);
    expect(added.statusCode).toBe(201);
    const photoId = added.json().id;
    await dom.post("/me/proof-terms", { adult: true, rules: true });
    expect((await upload(dom)).statusCode).toBe(403); // only the assignee adds proof

    const [listed] = (await dom.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-16`)).body;
    expect(listed.photoCount).toBe(1);
    expect((await dom.get(`/occurrences/${first.id}/photos`)).body.map((p: { id: string }) => p.id)).toEqual([photoId]);
    const view = (who: typeof dom) => ctx.app.inject({ method: "GET", url: `/photos/${photoId}`, headers: who.headers });
    expect((await view(dom)).rawPayload.equals(jpeg)).toBe(true);
    expect((await view(ctx.as(crypto.randomUUID()))).statusCode).toBe(404);

    expect((await dom.post("/reports", { subjectId: subId, photoId, reason: "other" })).status).toBe(201);
    expect((await dom.post("/reports", { subjectId: domId, reason: "other" })).status).toBe(400);
    expect((await ctx.as(crypto.randomUUID()).post("/reports", { subjectId: subId, reason: "other" })).status).toBe(404);

    expect((await sub.post(`/occurrences/${first.id}/complete`)).body.status).toBe("completed");
    expect((await dom.del(`/photos/${photoId}`)).status).toBe(403);
    expect((await sub.del(`/photos/${photoId}`)).status).toBe(204);
    expect((await view(dom)).statusCode).toBe(404);
    const [after] = (await dom.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-16`)).body;
    expect(after.photoCount).toBe(0);
  });

  it("runs a ritual step by step inside its window", async () => {
    const { dom, sub, relId, subId } = await ctx.pair();
    const steps = [
      { id: "kneel", title: "Kneel" },
      { id: "recite", title: "Recite the rules" },
    ];
    const made = await dom.post(`/relationships/${relId}/tasks`, task(subId, { steps, windowMinutes: 60 }));
    expect(made.body).toMatchObject({ steps, windowMinutes: 60 });
    const [first] = (await sub.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-16`)).body;
    expect(first).toMatchObject({ steps, stepsDone: [], opensAt: "2026-10-17T00:00:00.000Z" });
    const tick = (who: typeof dom, stepId: string, done = true) => who.post(`/occurrences/${first.id}/steps`, { stepId, done });

    try {
      expect((await tick(sub, "kneel")).status).toBe(409); // 8 am; it opens at 8 pm
      ctx.clock.now = new Date("2026-10-17T00:30:00Z");
      expect((await tick(sub, "kneel")).body.stepsDone).toEqual(["kneel"]);
      expect((await tick(dom, "recite")).status).toBe(403);
      expect((await tick(sub, "nope")).status).toBe(400);
      expect((await sub.post(`/occurrences/${first.id}/complete`)).status).toBe(409);
      expect((await tick(sub, "recite")).body.stepsDone).toEqual(["kneel", "recite"]);
      expect((await tick(sub, "recite", false)).body.stepsDone).toEqual(["kneel"]);
      // Dropping a step from the ritual drops it from what's left to do.
      await dom.patch(`/tasks/${made.body.id}`, { steps: [steps[0]] });
      expect((await sub.post(`/occurrences/${first.id}/complete`)).body.status).toBe("completed");
      expect((await tick(sub, "kneel", false)).status).toBe(409);
    } finally {
      ctx.clock.now = new Date("2026-10-16T12:00:00Z");
    }
    expect((await dom.post(`/relationships/${relId}/tasks`, task(subId, { steps: [steps[0], steps[0]] }))).status).toBe(400);
  });

  it("asks for a mood at a check-in and graphs it with journal moods", async () => {
    const { dom, sub, relId, subId } = await ctx.pair();
    await dom.post(`/relationships/${relId}/tasks`, task(subId, { askMood: true }));
    const [first] = (await sub.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-16`)).body;
    expect(first).toMatchObject({ askMood: true, mood: null });
    expect((await sub.post(`/occurrences/${first.id}/complete`, { noteMd: "Tired" })).status).toBe(409);
    expect((await sub.post(`/occurrences/${first.id}/complete`, { mood: 6 })).status).toBe(400);
    expect((await sub.post(`/occurrences/${first.id}/complete`, { mood: 2, noteMd: "Tired" })).body).toMatchObject({ status: "completed", mood: 2 });
    await sub.post(`/relationships/${relId}/notes`, { kind: "journal", title: "Good day", bodyMd: "x", mood: 4, visibility: "shared" });
    await sub.post(`/relationships/${relId}/notes`, { kind: "journal", title: "Secret", bodyMd: "x", mood: 1, visibility: "private" });
    const seen = (await dom.get(`/relationships/${relId}/moods`)).body;
    expect(seen.map((m: { mood: number; source: string }) => [m.source, m.mood])).toEqual([
      ["checkin", 2],
      ["journal", 4],
    ]);
    expect(seen[0]).toMatchObject({ userId: subId, note: "Tired" });
    expect((await sub.get(`/relationships/${relId}/moods`)).body).toHaveLength(3);
  });

  it("completes a journal task by writing the entry", async () => {
    const { dom, sub, relId, subId } = await ctx.pair();
    await dom.post(`/relationships/${relId}/tasks`, task(subId, { title: "Journal tonight", bodyMd: "What made you proud today?", asksJournal: true }));
    const [first] = (await sub.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-16`)).body;
    expect(first).toMatchObject({ asksJournal: true, journalPrompt: "What made you proud today?", journalNoteId: null });
    expect((await sub.post(`/occurrences/${first.id}/complete`)).status).toBe(409);
    expect((await sub.post(`/occurrences/${first.id}/complete`, { journal: { bodyMd: "  " } })).status).toBe(400);
    const done = (await sub.post(`/occurrences/${first.id}/complete`, { journal: { bodyMd: "Finished the report early." } })).body;
    expect(done.status).toBe("completed");
    const entry = (await dom.get(`/relationships/${relId}/notes`)).body.find((n: { id: string }) => n.id === done.journalNoteId);
    expect(entry).toMatchObject({ kind: "journal", title: "Journal tonight", bodyMd: "Finished the report early.", authorId: subId, visibility: "shared" });
    // Undo takes the entry back too, so redoing it doesn't leave two.
    expect((await sub.post(`/occurrences/${first.id}/undo`)).body).toMatchObject({ status: "pending", journalNoteId: null });
    expect((await dom.get(`/relationships/${relId}/notes`)).body.filter((n: { kind: string }) => n.kind === "journal")).toHaveLength(0);
  });

  it("accepts a note as proof", async () => {
    const { dom, sub, relId, subId } = await ctx.pair();
    await dom.post(`/relationships/${relId}/tasks`, task(subId, { proofRequired: true }));
    const [first] = (await sub.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-16`)).body;
    expect((await sub.post(`/occurrences/${first.id}/complete`, { noteMd: "  " })).status).toBe(409);
    expect((await sub.post(`/occurrences/${first.id}/complete`, { noteMd: "Done, 64 oz" })).body.status).toBe("completed");
  });

  it("counts a count task: done within its bounds, failed over the top, and corrections take either back", async () => {
    const { dom, sub, relId, subId } = await ctx.pair();
    const day = (id: string) =>
      sub.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-16`).then((r) => r.body.find((o: { seriesId: string }) => o.seriesId === id));
    const balance = async () => (await dom.get(`/relationships/${relId}/balances`)).body[0]?.balance ?? 0;
    expect((await dom.post(`/relationships/${relId}/tasks`, task(subId, { countMin: 5, countMax: 3 }))).status).toBe(400);
    expect((await dom.post(`/relationships/${relId}/tasks`, task(subId, { countMin: 3, askMood: true }))).status).toBe(400);

    // Exactly 3, with a consequence: done at 3, failed at 4, and back to done when a mis-tap is fixed.
    const c = (await dom.post(`/relationships/${relId}/consequences`, { title: "Corner time" })).body;
    const exact = (await dom.post(`/relationships/${relId}/tasks`, task(subId, { title: "Edges", countMin: 3, countMax: 3, missPenalty: 4, consequenceId: c.id }))).body;
    const o = await day(exact.id);
    expect(o).toMatchObject({ count: 0, countMin: 3, countMax: 3, status: "pending" });
    expect((await sub.post(`/occurrences/${o.id}/complete`)).status).toBe(409);
    await sub.post(`/occurrences/${o.id}/count`, { by: 1 });
    expect((await sub.post(`/occurrences/${o.id}/count`, { by: 1 })).body).toMatchObject({ count: 2, status: "pending" });
    expect((await sub.post(`/occurrences/${o.id}/count`, { by: 1 })).body).toMatchObject({ count: 3, status: "completed" });
    expect(await balance()).toBe(10);
    expect((await sub.post(`/occurrences/${o.id}/count`, { by: 1 })).body).toMatchObject({ count: 4, status: "missed" });
    expect(await balance()).toBe(-4);
    const consequences = async () => (await sub.get(`/relationships/${relId}/tasks`)).body.filter((t: { assignedConsequenceId: string | null }) => t.assignedConsequenceId).length;
    expect(await consequences()).toBe(1);
    expect((await sub.post(`/occurrences/${o.id}/count`, { to: 3 })).body).toMatchObject({ count: 3, status: "completed" });
    expect(await balance()).toBe(10);
    expect(await consequences()).toBe(0);
    expect((await sub.post(`/occurrences/${o.id}/count`, { to: 1 })).body).toMatchObject({ status: "pending" });
    expect(await balance()).toBe(0);

    // At least 2, points per count: done at 2 and keeps earning past it.
    const atLeast = (await dom.post(`/relationships/${relId}/tasks`, task(subId, { title: "Water", points: 1, countMin: 2, countPer: "count" }))).body;
    const w = await day(atLeast.id);
    await sub.post(`/occurrences/${w.id}/count`, { by: 1 });
    expect(await balance()).toBe(0);
    expect((await sub.post(`/occurrences/${w.id}/count`, { by: 1 })).body.status).toBe("completed");
    expect(await balance()).toBe(2);
    await sub.post(`/occurrences/${w.id}/count`, { by: 1 });
    expect(await balance()).toBe(3);

    // No more than 2 stays open until the deadline, then counts as done; short of a minimum by then is missed.
    const atMost = (await dom.post(`/relationships/${relId}/tasks`, task(subId, { title: "Sweets", points: 5, countMax: 2 }))).body;
    const m = await day(atMost.id);
    expect((await sub.post(`/occurrences/${m.id}/count`, { by: 1 })).body.status).toBe("pending");
    try {
      ctx.clock.now = new Date("2026-10-17T02:01:00Z");
      expect((await sub.post(`/occurrences/${m.id}/count`, { by: 1 })).status).toBe(409);
      await runJobs(ctx.db, ctx.notifier, ctx.clock.now, { materializeDays: 14, reminderLeadMinutes: 30 });
      expect((await day(atMost.id)).status).toBe("completed");
      expect((await day(exact.id)).status).toBe("missed");
      expect(await balance()).toBe(3 + 5 - 4);
    } finally {
      ctx.clock.now = new Date("2026-10-16T12:00:00Z");
    }
  });

  it("schedules completion-anchored tasks from the completion date", async () => {
    const { dom, sub, relId, subId } = await ctx.pair();
    await dom.post(`/relationships/${relId}/tasks`, task(subId, { schedule: { start: "2026-10-16", anchor: "completion", rule: { freq: "daily", interval: 3 } } }));
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
    expect(decided.body.occurrences.map((o: { dueAt: string }) => o.dueAt).sort()).toEqual(["2026-10-17T22:00:00.000Z", "2026-10-18T01:00:00.000Z"]);
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

  it("sorts out a plan's clashes task by task: a sub's call-off goes to the Dom, who can reschedule instead", async () => {
    const { dom, sub, relId, subId } = await withTask("allowance", 1);
    await dom.post(`/relationships/${relId}/tasks`, task(subId, { title: "Gym", dueTime: "18:00" }));
    const [gym, lines] = (await sub.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-16`)).body;
    const res = await sub.post(`/relationships/${relId}/reschedules/plan`, {
      items: [
        { occurrenceId: gym.id, action: "cancel" },
        { occurrenceId: lines.id, action: "move", dueAt: "2026-10-17T15:00:00Z" },
      ],
      reason: "At the wedding",
    });
    // The move uses the allowance and applies; calling a task off always waits for the Dom.
    expect(res.body.applied).toBe(false);
    expect(res.body.requests.map((r: { kind: string; status: string }) => [r.kind, r.status])).toEqual([
      ["cancel", "requested"],
      ["move", "applied"],
    ]);
    expect(res.body.occurrences[1].dueAt).toBe("2026-10-17T15:00:00.000Z");
    expect(ctx.notifier.sent.at(-1)!.push.body).toBe("Sub asked about a task that clashes with a plan");
    expect((await sub.post(`/relationships/${relId}/reschedules/plan`, { items: [{ occurrenceId: gym.id, action: "move" }] })).status).toBe(400);

    // The Dom moves it instead of calling it off.
    const [asked] = (await dom.get(`/relationships/${relId}/reschedules?status=requested`)).body;
    const decided = await dom.post(`/reschedules/${asked.id}/decide`, { approve: true, dueAt: "2026-10-17T22:00:00Z" });
    expect(decided.body.request).toMatchObject({ kind: "move", status: "approved", toDueAt: "2026-10-17T22:00:00.000Z" });
    expect(decided.body.occurrence).toMatchObject({ status: "pending", dueAt: "2026-10-17T22:00:00.000Z" });
    expect(ctx.notifier.sent.at(-1)!.push.body).toBe("Gym was rescheduled instead");
  });

  it("calls a task off when the Dom approves, and lets a Dom call one off directly", async () => {
    const { dom, sub, relId, first } = await withTask("request");
    await sub.post(`/relationships/${relId}/reschedules/plan`, { items: [{ occurrenceId: first.id, action: "cancel" }] });
    const [asked] = (await dom.get(`/relationships/${relId}/reschedules?status=requested`)).body;
    expect((await dom.post(`/reschedules/${asked.id}/decide`, { approve: true })).body.occurrence.status).toBe("cancelled");
    expect(ctx.notifier.sent.at(-1)!.push.body).toBe("Your request to call off a task was approved");

    const [next] = (await dom.get(`/relationships/${relId}/occurrences?from=2026-10-19&to=2026-10-19`)).body;
    const direct = await dom.post(`/relationships/${relId}/reschedules/plan`, { items: [{ occurrenceId: next.id, action: "cancel" }] });
    expect(direct.body).toMatchObject({ applied: true, occurrences: [{ status: "cancelled" }] });
    // Called-off occurrences leave the schedule but stay in the task's history.
    expect((await dom.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-19`)).body.map((o: { id: string }) => o.id)).not.toContain(next.id);
    const history = (await dom.get(`/tasks/${next.seriesId}/history`)).body as { id: string; status: string }[];
    expect(
      history
        .filter((o) => o.status === "cancelled")
        .map((o) => o.id)
        .sort(),
    ).toEqual([first.id, next.id].sort());
  });

  it("rejects deadlines in the past", async () => {
    const { dom, first } = await withTask("dominant_only");
    expect((await dom.post(`/occurrences/${first.id}/reschedule`, { dueAt: "2026-10-15T00:00:00Z" })).status).toBe(400);
  });
});

describe("background jobs", () => {
  it("marks missed occurrences, applies penalties, and reopening by reschedule reverses them", async () => {
    const { dom, sub, relId, subId } = await ctx.pair();
    await dom.post(`/relationships/${relId}/tasks`, task(subId, { missPenalty: 5, graceMinutes: 60 }));
    const [first] = (await dom.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-16`)).body;

    ctx.clock.now = new Date("2026-10-17T01:30:00Z"); // 30 min past due, inside grace
    await runJobs(ctx.db, ctx.notifier, ctx.clock.now, { materializeDays: 14, reminderLeadMinutes: 30 });
    expect((await dom.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-16`)).body[0].status).toBe("pending");

    ctx.clock.now = new Date("2026-10-17T02:01:00Z");
    await runJobs(ctx.db, ctx.notifier, ctx.clock.now, { materializeDays: 14, reminderLeadMinutes: 30 });
    expect((await dom.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-16`)).body[0].status).toBe("missed");
    expect((await dom.get(`/relationships/${relId}/balances`)).body[0].balance).toBe(-5);

    // A Dominant can leave it missed: the penalty stays and it stops needing them. Only a missed one can be.
    expect((await sub.post(`/occurrences/${first.id}/confirm-miss`)).status).toBe(403);
    expect((await dom.post(`/occurrences/${first.id}/confirm-miss`)).body).toMatchObject({ status: "missed", missConfirmed: true });
    expect((await dom.get(`/relationships/${relId}/balances`)).body[0].balance).toBe(-5);
    // Excusing it and setting it back to missed from the history leaves it decided too.
    expect((await dom.patch(`/occurrences/${first.id}`, { status: "excused" })).body.missConfirmed).toBe(false);
    expect((await dom.patch(`/occurrences/${first.id}`, { status: "missed" })).body).toMatchObject({ status: "missed", missConfirmed: true });

    const res = await dom.post(`/occurrences/${first.id}/reschedule`, { delayHours: 24 });
    expect(res.body.occurrence.status).toBe("pending");
    expect((await dom.post(`/occurrences/${first.id}/confirm-miss`)).status).toBe(409);
    expect((await dom.get(`/relationships/${relId}/balances`)).body[0].balance).toBe(0);
    ctx.clock.now = new Date("2026-10-16T12:00:00Z");
  });

  it("lets anyone call a safe word, tells the others through quiet hours, and excuses misses while red is on", async () => {
    const { dom, sub, relId, domId, subId } = await ctx.pair();
    await dom.post(`/relationships/${relId}/tasks`, task(subId, { missPenalty: 5 }));
    expect((await sub.get(`/relationships/${relId}/safe-calls`)).body).toEqual({ active: null, recent: [] });

    const yellow = await sub.post(`/relationships/${relId}/safe-calls`, { level: "yellow", note: "Need to talk" });
    expect(yellow.status).toBe(201);
    expect(ctx.notifier.sent.at(-1)).toMatchObject({ userIds: [domId], push: { body: "Sub called yellow", urgent: true, data: { type: "safe_call", level: "yellow" } } });
    // Calling again changes the open call rather than opening a second one, and keeps the note.
    const red = await sub.post(`/relationships/${relId}/safe-calls`, { level: "red" });
    expect(red).toMatchObject({ status: 200, body: { id: yellow.body.id, level: "red", note: "Need to talk" } });
    expect((await dom.get(`/relationships/${relId}/safe-calls`)).body.active).toMatchObject({ id: yellow.body.id, level: "red", callerId: subId });
    expect((await (await ctx.pair()).dom.get(`/relationships/${relId}/safe-calls`)).status).toBe(404);

    ctx.clock.now = new Date("2026-10-17T02:01:00Z");
    await runJobs(ctx.db, ctx.notifier, ctx.clock.now, { materializeDays: 14, reminderLeadMinutes: 30 });
    expect((await dom.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-16`)).body[0].status).toBe("excused");
    expect((await dom.get(`/relationships/${relId}/balances`)).body[0]?.balance ?? 0).toBe(0);

    const cleared = await dom.post(`/safe-calls/${yellow.body.id}/clear`);
    expect(cleared.body).toMatchObject({ clearedBy: domId, clearedAt: ctx.clock.now.toISOString() });
    expect(ctx.notifier.sent.at(-1)).toMatchObject({ userIds: [subId], push: { data: { type: "safe_call_cleared" } } });
    expect((await sub.get(`/relationships/${relId}/safe-calls`)).body).toMatchObject({ active: null, recent: [{ id: yellow.body.id }] });

    // Once it's cleared, the next miss counts.
    ctx.clock.now = new Date("2026-10-20T02:01:00Z");
    await runJobs(ctx.db, ctx.notifier, ctx.clock.now, { materializeDays: 14, reminderLeadMinutes: 30 });
    expect((await dom.get(`/relationships/${relId}/occurrences?from=2026-10-19&to=2026-10-19`)).body[0].status).toBe("missed");
    ctx.clock.now = new Date("2026-10-16T12:00:00Z");
  });

  it("takes a completion made offline at the time it was done, even after the miss job ran", async () => {
    const { dom, sub, relId } = await ctx.pair();
    await dom.post(`/relationships/${relId}/tasks`, task((await sub.get("/me")).body.user.id, { missPenalty: 5 }));
    ctx.clock.now = new Date("2026-10-17T02:01:00Z");
    await runJobs(ctx.db, ctx.notifier, ctx.clock.now, { materializeDays: 14, reminderLeadMinutes: 30 });
    const [occ] = (await sub.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-16`)).body;
    expect(occ.status).toBe("missed");

    // Done at 8:50 pm New York with no signal; it reaches the server an hour later.
    const done = await sub.post(`/occurrences/${occ.id}/complete`, { doneAt: "2026-10-17T00:50:00.000Z" });
    expect(done.body).toMatchObject({ status: "completed", completedAt: "2026-10-17T00:50:00.000Z", syncedAt: ctx.clock.now.toISOString() });
    expect((await dom.get(`/relationships/${relId}/balances`)).body[0]?.balance ?? 0).toBe(occ.points);

    // Too old to sync, or done after the miss was due, it stays as it is.
    ctx.clock.now = new Date("2026-10-20T02:01:00Z");
    await runJobs(ctx.db, ctx.notifier, ctx.clock.now, { materializeDays: 14, reminderLeadMinutes: 30 });
    const [late] = (await sub.get(`/relationships/${relId}/occurrences?from=2026-10-19&to=2026-10-19`)).body;
    expect((await sub.post(`/occurrences/${late.id}/complete`, { doneAt: "2026-10-20T01:30:00.000Z" })).status).toBe(409);
    expect((await sub.post(`/occurrences/${late.id}/complete`, { doneAt: "2026-10-18T23:00:00.000Z" })).status).toBe(409);
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

describe("monthly review", () => {
  it("lets a Dominant set the month's focus and each person look back on it once the review opens", async () => {
    const { dom, sub, relId, domId, subId } = await ctx.pair();
    const t = (await dom.post(`/relationships/${relId}/tasks`, task(subId))).body;
    const q = "?zone=America/New_York";
    expect((await sub.put(`/relationships/${relId}/months/2026-10/focus`, { goal: "Be on time" })).status).toBe(403);
    const focus = await dom.put(`/relationships/${relId}/months/2026-10/focus`, { goal: " Be on time ", taskIds: [t.id] });
    expect(focus.body).toMatchObject({ goal: "Be on time", taskIds: [t.id], setBy: domId });
    expect((await sub.get(`/relationships/${relId}/months/2026-10${q}`)).body).toMatchObject({
      subjectId: subId,
      reviewOpensOn: "2026-10-29",
      reviewOpen: false,
      waitingOn: expect.arrayContaining([domId, subId]),
    });
    expect((await sub.put(`/relationships/${relId}/months/2026-10/review${q}`, { rating: 4 })).status).toBe(409);

    ctx.clock.now = new Date("2026-10-29T16:00:00Z");
    const opts = { materializeDays: 14, reminderLeadMinutes: 30 };
    await runJobs(ctx.db, ctx.notifier, ctx.clock.now, opts);
    await runJobs(ctx.db, ctx.notifier, ctx.clock.now, opts);
    const prompts = ctx.notifier.sent.filter((s) => s.push.data?.type === "month_review_open" && (s.userIds.includes(subId) || s.userIds.includes(domId)));
    expect(prompts).toHaveLength(2);

    const mine = await sub.put(`/relationships/${relId}/months/2026-10/review${q}`, { rating: 4, wentWell: "Mornings", workOn: "Gym" });
    expect(mine.body).toMatchObject({ userId: subId, rating: 4, wentWell: "Mornings", workOn: "Gym" });
    expect(ctx.notifier.sent.at(-1)).toMatchObject({ userIds: [domId], push: { body: "Sub looked back on October" } });
    // The Dominant can't read it until they've answered too.
    expect((await dom.get(`/relationships/${relId}/months/2026-10${q}`)).body).toMatchObject({ reviewOpen: true, reviews: [], waitingOn: [domId] });
    await dom.put(`/relationships/${relId}/months/2026-10/review${q}`, { rating: 5 });
    const summary = (await dom.get(`/relationships/${relId}/months/2026-10${q}`)).body;
    expect(summary.reviews).toHaveLength(2);
    // Every third day from Oct 16, all missed: the 16th, 19th, 22nd, 25th and 28th.
    expect(summary.totals).toMatchObject({ done: 0, missed: 5, rate: 0 });
    expect(summary.focusTasks).toEqual([expect.objectContaining({ taskId: t.id, missed: 5 })]);

    ctx.clock.now = new Date("2026-11-02T16:00:00Z");
    expect((await sub.get(`/relationships/${relId}/months${q}`)).body).toEqual([{ month: "2026-10", goal: "Be on time", myRating: 4, rate: 0 }]);
    await dom.patch(`/relationships/${relId}`, { features: { review: false } });
    expect((await sub.get(`/relationships/${relId}/months${q}`)).status).toBe(403);
    ctx.clock.now = new Date("2026-10-16T12:00:00Z");
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

  it("keeps comments on a journal entry for anyone who can read it", async () => {
    const { dom, sub, relId, subId, domId } = await ctx.pair();
    const entry = (await sub.post(`/relationships/${relId}/notes`, { kind: "journal", bodyMd: "Long day" })).body;
    expect(entry.commentCount).toBe(0);
    const c = await dom.post(`/notes/${entry.id}/comments`, { body: " Proud of you " });
    expect(c.body).toMatchObject({ noteId: entry.id, authorId: domId, body: "Proud of you" });
    expect(ctx.notifier.sent.at(-1)).toMatchObject({ userIds: [subId], push: { body: "Dom commented on a journal entry" } });
    await sub.post(`/notes/${entry.id}/comments`, { body: "Thank you" });
    expect((await sub.get(`/notes/${entry.id}/comments`)).body.map((x: { body: string }) => x.body)).toEqual(["Proud of you", "Thank you"]);
    expect((await dom.get(`/relationships/${relId}/notes`)).body[0]).toMatchObject({ commentCount: 2, updatedAt: entry.updatedAt });

    expect((await sub.del(`/note-comments/${c.body.id}`)).status).toBe(403);
    expect((await dom.del(`/note-comments/${c.body.id}`)).status).toBe(204);
    expect((await sub.get(`/relationships/${relId}/notes`)).body[0].commentCount).toBe(1);

    const priv = (await sub.post(`/relationships/${relId}/notes`, { kind: "journal", bodyMd: "Just mine", visibility: "private" })).body;
    expect((await dom.get(`/notes/${priv.id}/comments`)).status).toBe(404);
    expect((await dom.post(`/notes/${priv.id}/comments`, { body: "Hi" })).status).toBe(404);
  });

  it("keeps earlier versions of an edited journal entry, one per sitting", async () => {
    const { dom, sub, relId, subId } = await ctx.pair();
    const entry = (await sub.post(`/relationships/${relId}/notes`, { kind: "journal", title: "Monday", bodyMd: "First draft" })).body;
    expect(entry.revisionCount).toBe(0);
    try {
      expect((await sub.patch(`/notes/${entry.id}`, { bodyMd: "Second draft" })).body.revisionCount).toBe(1);
      // Another save in the same sitting, and a change that leaves the text alone, add nothing.
      expect((await sub.patch(`/notes/${entry.id}`, { bodyMd: "Second draft, tidied" })).body.revisionCount).toBe(1);
      expect((await sub.patch(`/notes/${entry.id}`, { mood: 3 })).body.revisionCount).toBe(1);
      ctx.clock.now = new Date(ctx.clock.now.getTime() + 11 * 60_000);
      expect((await sub.patch(`/notes/${entry.id}`, { title: "Monday, again" })).body.revisionCount).toBe(2);
    } finally {
      ctx.clock.now = new Date("2026-10-16T12:00:00Z");
    }
    const history = (await dom.get(`/notes/${entry.id}/revisions`)).body;
    expect(history.map((r: { title: string; bodyMd: string }) => [r.title, r.bodyMd])).toEqual([
      ["Monday", "Second draft, tidied"],
      ["Monday", "First draft"],
    ]);
    expect(history[0]).toMatchObject({ noteId: entry.id, editorId: subId });

    const priv = (await sub.post(`/relationships/${relId}/notes`, { kind: "journal", bodyMd: "Mine", visibility: "private" })).body;
    expect((await dom.get(`/notes/${priv.id}/revisions`)).status).toBe(404);
  });

  it("keeps a dynamic's dates, editable only by a Dominant", async () => {
    const { dom, sub, relId } = await ctx.pair();
    const dates = [{ id: "a", label: "Anniversary", date: "2023-03-04" }];
    expect((await sub.patch(`/relationships/${relId}`, { dates })).status).toBe(403);
    expect((await dom.patch(`/relationships/${relId}`, { dates })).body.dates).toEqual(dates);
    expect((await dom.patch(`/relationships/${relId}`, { dates: [{ id: "b", label: "", date: "2023-03-04" }] })).status).toBe(400);
    expect((await sub.get("/me")).body.relationships[0].dates).toEqual(dates);
  });

  it("lets a Dominant decide what a sub can write in notes", async () => {
    const { dom, sub, relId } = await ctx.pair();
    const domNote = (await dom.post(`/relationships/${relId}/notes`, { bodyMd: "House list" })).body;
    expect(domNote).toMatchObject({ subCanEdit: false, canEdit: true });
    expect((await sub.patch(`/notes/${domNote.id}`, { bodyMd: "x" })).status).toBe(403);

    // Opened up: the sub edits the text but can't make it private, re-share it or delete it.
    await dom.patch(`/notes/${domNote.id}`, { subCanEdit: true });
    expect((await sub.get(`/relationships/${relId}/notes`)).body[0]).toMatchObject({ canEdit: true });
    const edited = (await sub.patch(`/notes/${domNote.id}`, { bodyMd: "House list, done", visibility: "private", subCanEdit: false })).body;
    expect(edited).toMatchObject({ bodyMd: "House list, done", visibility: "shared", subCanEdit: true });
    expect((await sub.del(`/notes/${domNote.id}`)).status).toBe(403);

    // A sub can't open their own notes to anyone, and loses writing when it's switched off.
    const own = (await sub.post(`/relationships/${relId}/notes`, { bodyMd: "Mine", subCanEdit: true })).body;
    expect(own.subCanEdit).toBe(false);
    expect((await sub.patch(`/relationships/${relId}`, { subNotes: false })).status).toBe(403);
    expect((await dom.patch(`/relationships/${relId}`, { subNotes: false })).body.subNotes).toBe(false);
    expect((await sub.post(`/relationships/${relId}/notes`, { bodyMd: "Another" })).status).toBe(403);
    expect((await sub.patch(`/notes/${own.id}`, { bodyMd: "Changed" })).status).toBe(403);
    expect((await sub.post(`/relationships/${relId}/notes`, { kind: "journal", bodyMd: "Today" })).status).toBe(201);
    const list = (await sub.get(`/relationships/${relId}/notes`)).body;
    expect(list.find((n: { id: string }) => n.id === own.id).canEdit).toBe(false);
    expect((await sub.patch(`/notes/${domNote.id}`, { bodyMd: "Still allowed" })).status).toBe(200);
  });

  it("lets only Dominants edit the rule book", async () => {
    const { dom, sub, relId } = await ctx.pair();
    expect((await sub.post(`/relationships/${relId}/rules`, { title: "Ask first" })).status).toBe(403);
    const rule = (await dom.post(`/relationships/${relId}/rules`, { title: "Ask first" })).body;
    const patched = (await dom.patch(`/rules/${rule.id}`, { category: "Protocol" })).body;
    expect(patched).toMatchObject({ title: "Ask first", position: 1, category: "Protocol" });
  });
});

describe("task history", () => {
  it("lists finished occurrences and lets a Dominant correct them, rebooking points", async () => {
    const { dom, sub, relId, subId } = await ctx.pair();
    const t = (await dom.post(`/relationships/${relId}/tasks`, task(subId, { points: 10, missPenalty: 4, schedule: { start: "2026-10-16", rule: { freq: "daily" } } }))).body;
    await dom.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-18`);
    const balance = async () => ((await sub.get(`/relationships/${relId}/balances`)).body.find((b: { userId: string }) => b.userId === subId)?.balance ?? 0) as number;
    try {
      ctx.clock.now = new Date("2026-10-17T12:00:00Z"); // the 16th's 21:00 deadline has passed
      await runJobs(ctx.db, ctx.notifier, ctx.clock.now, { materializeDays: 14, reminderLeadMinutes: 30 });

      const history = (await sub.get(`/tasks/${t.id}/history`)).body;
      expect(history.map((h: { originalDate: string; status: string }) => [h.originalDate, h.status])).toEqual([["2026-10-16", "missed"]]);
      expect(history[0].pointsDelta).toBe(-4);
      expect((await sub.get(`/tasks/${t.id}/stats`)).body).toMatchObject({ done: 0, missed: 1, rate: 0, streak: 0 });
      const before = await balance();

      const id = history[0].id;
      expect((await sub.patch(`/occurrences/${id}`, { status: "completed" })).status).toBe(403);
      const fixed = await dom.patch(`/occurrences/${id}`, { status: "completed", completedAt: "2026-10-16T22:30:00-04:00" });
      expect(fixed.status).toBe(200);
      expect(await balance()).toBe(before + 4 + 10);

      const [after] = (await sub.get(`/tasks/${t.id}/history`)).body;
      expect(after).toMatchObject({ status: "completed", pointsDelta: 10, completedAt: "2026-10-17T02:30:00.000Z" });
      expect(after.editedBy).toBeTruthy();
      expect((await sub.get(`/tasks/${t.id}/stats`)).body).toMatchObject({ done: 1, missed: 0, rate: 1, streak: 1, bestStreak: 1 });
      expect((await sub.get(`/relationships/${relId}/streaks`)).body).toEqual([{ taskId: t.id, streak: 1, recent: ["completed"] }]);

      await dom.patch(`/occurrences/${id}`, { status: "excused" });
      expect(await balance()).toBe(before + 4);
      expect((await dom.patch(`/occurrences/${id}`, { status: "pending" })).status).toBe(400);
    } finally {
      ctx.clock.now = new Date("2026-10-16T12:00:00Z");
    }
  });
});

describe("assigned consequences", () => {
  it("become a one-off task with the reason, for a Dominant to hand out", async () => {
    const { dom, sub, relId, subId } = await ctx.pair();
    const c = (await dom.post(`/relationships/${relId}/consequences`, { title: "Write lines", bodyMd: "100 lines, by hand." })).body;
    const input = { assigneeId: subId, date: "2026-10-17", dueTime: "20:00", timezone: "UTC", reason: "Talked back" };
    expect((await sub.post(`/consequences/${c.id}/assign`, input)).status).toBe(403);
    const res = await dom.post(`/consequences/${c.id}/assign`, input);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: "Write lines",
      assigneeId: subId,
      assignedConsequenceId: c.id,
      bodyMd: "**Why:** Talked back\n\n100 lines, by hand.",
      schedule: { start: "2026-10-17" },
    });
    expect(ctx.notifier.sent.at(-1)).toMatchObject({ userIds: [subId] });

    const occ = (await sub.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-20`)).body.filter((o: { seriesId: string }) => o.seriesId === res.body.id);
    expect(occ).toHaveLength(1);
    expect(occ[0]).toMatchObject({ dueAt: "2026-10-17T20:00:00.000Z", status: "pending" });
    expect((await sub.post(`/occurrences/${occ[0].id}/complete`, {})).body.status).toBe("completed");

    const other = await ctx.pair();
    expect((await dom.post(`/consequences/${c.id}/assign`, { ...input, assigneeId: other.subId })).status).toBe(400);
  });

  it("are handed out once when a task carrying one is missed, and taken back if the miss is undone", async () => {
    const { dom, sub, relId, subId } = await ctx.pair();
    const c = (await dom.post(`/relationships/${relId}/consequences`, { title: "Corner time" })).body;
    const t = (
      await dom.post(
        `/relationships/${relId}/tasks`,
        task(subId, { consequenceId: c.id, consequenceDueDays: 0, consequenceDueTime: "22:00", schedule: { start: "2026-10-16", rule: { freq: "daily" } } }),
      )
    ).body;
    await dom.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-18`);
    const issued = async () =>
      ((await sub.get(`/relationships/${relId}/tasks`)).body as { assignedConsequenceId: string | null }[]).filter((x) => x.assignedConsequenceId === c.id);
    try {
      ctx.clock.now = new Date("2026-10-17T12:00:00Z"); // the 16th's 21:00 New York deadline has passed
      await runJobs(ctx.db, ctx.notifier, ctx.clock.now, { materializeDays: 14, reminderLeadMinutes: 30 });
      await runJobs(ctx.db, ctx.notifier, ctx.clock.now, { materializeDays: 14, reminderLeadMinutes: 30 });
      const [given, ...extra] = await issued();
      expect(extra).toHaveLength(0);
      expect(given).toMatchObject({
        title: "Corner time",
        assigneeId: subId,
        bodyMd: "**Why:** Missed “Kneel and write lines” on Oct 16",
        schedule: { start: "2026-10-17" },
        dueTime: "22:00",
      });
      expect(ctx.notifier.sent.some((n) => n.push.body === "A task was missed, and a consequence was added")).toBe(true);

      const [miss] = (await sub.get(`/tasks/${t.id}/history`)).body;
      await dom.patch(`/occurrences/${miss.id}`, { status: "excused" });
      expect(await issued()).toHaveLength(0);
    } finally {
      ctx.clock.now = new Date("2026-10-16T12:00:00Z");
    }
  });
});

describe("protocols", () => {
  it("stand alone or link to a rule in the same relationship, and reorder with rules", async () => {
    const { dom, sub, relId } = await ctx.pair();
    const other = await ctx.pair();
    const rule = (await dom.post(`/relationships/${relId}/rules`, { title: "Stay hydrated", position: 1 })).body;
    const r2 = (await dom.post(`/relationships/${relId}/rules`, { title: "Ask first", position: 2 })).body;
    const foreign = (await other.dom.post(`/relationships/${other.relId}/rules`, { title: "Elsewhere" })).body;

    const water = await dom.post(`/relationships/${relId}/protocols`, { title: "Water", bodyMd: "64 oz a day", ruleId: rule.id });
    expect(water.status).toBe(201);
    expect(water.body.ruleId).toBe(rule.id);
    expect((await dom.post(`/relationships/${relId}/protocols`, { title: "Greeting" })).body.ruleId).toBeNull();
    expect((await dom.post(`/relationships/${relId}/protocols`, { title: "x", ruleId: foreign.id })).status).toBe(400);
    expect((await sub.post(`/relationships/${relId}/protocols`, { title: "x" })).status).toBe(403);
    expect((await sub.get(`/relationships/${relId}/protocols`)).body).toHaveLength(2);

    const order = await dom.put(`/relationships/${relId}/rules/order`, { ids: [r2.id, rule.id, foreign.id] });
    expect(order.body.map((r: { title: string; position: number }) => [r.title, r.position])).toEqual([
      ["Ask first", 1],
      ["Stay hydrated", 2],
    ]);
    expect((await other.dom.get(`/relationships/${other.relId}/rules`)).body[0].position).toBe(1);
    expect((await sub.put(`/relationships/${relId}/rules/order`, { ids: [rule.id] })).status).toBe(403);

    // Deleting a rule keeps its protocols, now standalone.
    await dom.del(`/rules/${rule.id}`);
    expect((await dom.get(`/relationships/${relId}/protocols`)).body.find((p: { title: string }) => p.title === "Water").ruleId).toBeNull();
  });
});

describe("stats", () => {
  it("counts a person's done, missed and excused tasks by local day, with the stretch before for the trend", async () => {
    const { dom, sub, relId, subId, domId } = await ctx.pair();
    const t = (await dom.post(`/relationships/${relId}/tasks`, task(subId, { schedule: { start: "2026-10-16", rule: { freq: "daily" } } }))).body;
    try {
      const occs = (await dom.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-22`)).body as { id: string; originalDate: string }[];
      ctx.clock.now = new Date("2026-10-23T12:00:00Z");
      await runJobs(ctx.db, ctx.notifier, ctx.clock.now, { materializeDays: 14, reminderLeadMinutes: 30 });
      const on = (d: string) => occs.find((o) => o.originalDate === d)!.id;
      await dom.patch(`/occurrences/${on("2026-10-20")}`, { status: "completed" });
      await dom.patch(`/occurrences/${on("2026-10-21")}`, { status: "completed" });
      await dom.patch(`/occurrences/${on("2026-10-19")}`, { status: "excused" });

      const stats = (await dom.get(`/relationships/${relId}/stats?days=7&zone=${encodeURIComponent(NY)}`)).body;
      expect(stats.totals).toMatchObject({ done: 2, missed: 3, excused: 1, rate: 2 / 5 });
      expect(stats.previous).toEqual({ done: 0, missed: 1, excused: 0, rate: 0 });
      expect(stats.bucket).toBe("day");
      expect(stats.buckets.map((b: { start: string; done: number; missed: number }) => [b.start, b.done, b.missed])).toEqual([
        ["2026-10-17", 0, 1],
        ["2026-10-18", 0, 1],
        ["2026-10-19", 0, 0],
        ["2026-10-20", 1, 0],
        ["2026-10-21", 1, 0],
        ["2026-10-22", 0, 1],
        ["2026-10-23", 0, 0],
      ]);
      expect(stats.weekdays[2]).toMatchObject({ done: 1, missed: 0 }); // the 20th is a Tuesday
      expect(stats.tasks).toEqual([{ taskId: t.id, title: t.title, active: true, streak: 0, done: 2, missed: 3, excused: 1, rate: 2 / 5 }]);

      expect((await sub.get(`/relationships/${relId}/stats?days=90&zone=${encodeURIComponent(NY)}`)).body).toMatchObject({ bucket: "week", totals: { done: 2, missed: 4 } });
      expect((await sub.get(`/relationships/${relId}/stats?userId=${domId}`)).body.totals).toMatchObject({ done: 0, missed: 0, rate: null });
      expect((await sub.get(`/relationships/${relId}/stats?days=12`)).status).toBe(400);
      await dom.patch(`/relationships/${relId}`, { features: { stats: false } });
      expect((await sub.get(`/relationships/${relId}/stats`)).status).toBe(403);
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
      protocols: true,
      journal: true,
      stats: true,
      review: true,
    });
    // Notes can't be switched off; the key is ignored.
    expect((await dom.patch(`/relationships/${relId}`, { features: { notes: false } })).body.features).not.toHaveProperty("notes");
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

describe("limits", () => {
  it("lets each person keep their own limits, which partners see but can't change", async () => {
    const { dom, sub, relId, subId } = await ctx.pair();
    const hard = await sub.post(`/relationships/${relId}/limits`, { title: "Public humiliation", kind: "hard" });
    expect(hard.status).toBe(201);
    expect(hard.body).toMatchObject({ ownerId: subId, kind: "hard", note: "" });
    await dom.post(`/relationships/${relId}/limits`, { title: "Rope", kind: "curious", note: "Start simple" });
    expect((await dom.get(`/relationships/${relId}/limits`)).body.map((l: { title: string }) => l.title)).toEqual(["Public humiliation", "Rope"]);
    expect((await dom.patch(`/limits/${hard.body.id}`, { kind: "soft" })).status).toBe(403);
    expect((await dom.del(`/limits/${hard.body.id}`)).status).toBe(403);
    expect((await sub.patch(`/limits/${hard.body.id}`, { note: "Not even in private" })).body).toMatchObject({ kind: "hard", note: "Not even in private" });
    expect((await sub.post(`/relationships/${relId}/limits`, { title: "x", kind: "maybe" })).status).toBe(400);
    expect((await sub.del(`/limits/${hard.body.id}`)).status).toBe(204);
    expect((await sub.get(`/relationships/${relId}/limits`)).body).toHaveLength(1);
  });
});

describe("broken-rule log", () => {
  it("logs a broken rule with a consequence, and lets a sub own up to one", async () => {
    const { dom, sub, relId, subId, domId } = await ctx.pair();
    const rule = (await dom.post(`/relationships/${relId}/rules`, { title: "Ask before buying anything over $50" })).body;
    const proto = (await dom.post(`/relationships/${relId}/protocols`, { title: "Kneel when greeting", ruleId: null })).body;
    const c = (await dom.post(`/relationships/${relId}/consequences`, { title: "Write lines" })).body;

    const logged = await dom.post(`/relationships/${relId}/rule-log`, {
      subjectId: subId,
      ruleId: rule.id,
      note: "New headphones",
      occurredOn: "2026-10-16",
      consequence: { consequenceId: c.id, date: "2026-10-17", dueTime: "20:00", timezone: "America/New_York" },
    });
    expect(logged.status).toBe(201);
    expect(logged.body).toMatchObject({ subjectId: subId, loggedBy: domId, title: "Ask before buying anything over $50", note: "New headphones" });
    expect(logged.body.consequenceTaskId).toBeTruthy();
    expect(ctx.notifier.sent.at(-1)).toMatchObject({ userIds: [subId], push: { body: "Dom logged a broken rule and gave you a consequence" } });
    expect((await sub.get(`/relationships/${relId}/tasks`)).body.some((t: { id: string }) => t.id === logged.body.consequenceTaskId)).toBe(true);

    // A sub owns up to their own, can't log a partner's, and can't hand out consequences.
    const own = await sub.post(`/relationships/${relId}/rule-log`, { subjectId: subId, protocolId: proto.id, occurredOn: "2026-10-17" });
    expect(own.body.title).toBe("Kneel when greeting");
    expect(ctx.notifier.sent.at(-1)).toMatchObject({ userIds: [domId], push: { body: "Sub owned up to a broken rule" } });
    expect((await sub.post(`/relationships/${relId}/rule-log`, { subjectId: domId, ruleId: rule.id, occurredOn: "2026-10-17" })).status).toBe(403);
    expect((await sub.post(`/relationships/${relId}/rule-log`, { subjectId: subId, occurredOn: "2026-10-17" })).status).toBe(400);

    // Newest first; the title survives the rule being deleted.
    await dom.del(`/rules/${rule.id}`);
    const log = (await sub.get(`/relationships/${relId}/rule-log`)).body;
    expect(log.map((e: { title: string }) => e.title)).toEqual(["Kneel when greeting", "Ask before buying anything over $50"]);
    expect(log[1].ruleId).toBeNull();
    expect((await sub.del(`/rule-log/${logged.body.id}`)).status).toBe(403);
    expect((await sub.del(`/rule-log/${own.body.id}`)).status).toBe(204);
  });
});

describe("starter kits", () => {
  it("adds the picked parts of a kit, with protocols linked to their rules", async () => {
    const { dom, sub, relId, subId } = await ctx.pair();
    expect((await sub.get("/kits")).body.map((k: { id: string }) => k.id)).toContain("daily-basics");
    const base = { timezone: "America/New_York", start: "2026-10-16" };

    expect((await sub.post(`/relationships/${relId}/kits/daily-basics`, { ...base, assigneeId: subId })).status).toBe(403);
    expect((await dom.post(`/relationships/${relId}/kits/nope`, base)).status).toBe(404);
    expect((await dom.post(`/relationships/${relId}/kits/daily-basics`, base)).status).toBe(400);

    const added = await dom.post(`/relationships/${relId}/kits/daily-basics`, { ...base, items: ["morning", "lights"], assigneeId: subId });
    expect(added.status).toBe(201);
    expect(added.body).toEqual({ tasks: 2, rules: 0, protocols: 0 });
    expect(ctx.notifier.sent.at(-1)).toMatchObject({ userIds: [subId], push: { body: "You have 2 new tasks" } });
    const tasks = (await sub.get(`/relationships/${relId}/tasks`)).body;
    expect(tasks.map((t: { title: string }) => t.title).sort()).toEqual(["Lights out", "Morning check-in"]);
    // It's 8 am in New York: both start today. At 10 am, the 9 am check-in would start tomorrow instead.
    const firsts = async () =>
      Object.fromEntries(
        ((await sub.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-17`)).body as { title: string; originalDate: string }[])
          .reverse()
          .map((o) => [o.title, o.originalDate]),
      );
    expect(await firsts()).toMatchObject({ "Morning check-in": "2026-10-16", "Lights out": "2026-10-16" });
    ctx.clock.now = new Date("2026-10-16T14:00:00Z");
    await dom.post(`/relationships/${relId}/kits/daily-basics`, { ...base, items: ["morning"], assigneeId: subId });
    ctx.clock.now = new Date("2026-10-16T12:00:00Z");
    const later = (await sub.get(`/relationships/${relId}/tasks`)).body.find(
      (t: { id: string; title: string }) => t.title === "Morning check-in" && !tasks.some((x: { id: string }) => x.id === t.id),
    );
    expect(later.schedule.start).toBe("2026-10-17");

    // Rules need no assignee; protocols point at the rule they spell out.
    const rules = await dom.post(`/relationships/${relId}/kits/rules`, { ...base, items: ["hydrated", "hydrated-p"] });
    expect(rules.body).toEqual({ tasks: 0, rules: 1, protocols: 1 });
    const [rule] = (await sub.get(`/relationships/${relId}/rules`)).body;
    const [proto] = (await sub.get(`/relationships/${relId}/protocols`)).body;
    expect(proto.ruleId).toBe(rule.id);
  });
});

describe("push payloads", () => {
  it("sends Android data only, so the app titles it with the discreet-mode name", () => {
    const [web, android] = fcmMessages(
      [
        { token: "w", platform: "web" },
        { token: "a", platform: "android" },
      ],
      { title: "Fealty", body: "A task is due soon", data: { type: "reminder" } },
    );
    expect(web).toMatchObject({ tokens: ["w"], notification: { title: "Fealty", body: "A task is due soon" } });
    expect(android).toEqual({ tokens: ["a"], data: { type: "reminder", body: "A task is due soon" }, android: { priority: "high" } });
  });

  it("sends silently to devices in quiet hours", () => {
    const [web, android] = fcmMessages(
      [
        { token: "w", platform: "web", quiet: true },
        { token: "a", platform: "android", quiet: true },
      ],
      { title: "Fealty", body: "A task is due soon" },
    );
    expect(web).toMatchObject({ tokens: ["w"], webpush: { notification: { silent: true } } });
    expect(android!.data).toMatchObject({ quiet: "1" });
  });

  it("works out quiet hours in the person's own time zone, across midnight", () => {
    const night = { start: "22:00", end: "07:00", timezone: "America/New_York" };
    expect(isQuiet(night, new Date("2026-10-17T03:30:00Z"))).toBe(true); // 23:30 in New York
    expect(isQuiet(night, new Date("2026-10-17T10:59:00Z"))).toBe(true); // 06:59
    expect(isQuiet(night, new Date("2026-10-17T11:00:00Z"))).toBe(false); // 07:00
    expect(isQuiet({ ...night, start: "13:00", end: "14:00" }, new Date("2026-10-17T17:30:00Z"))).toBe(true);
    expect(isQuiet(null, new Date())).toBe(false);
  });

  it("skips the kinds of notification a person turned off", async () => {
    const { dom, sub, relId, subId } = await ctx.pair();
    await dom.post(`/relationships/${relId}/tasks`, task(subId));
    const [occ] = (await sub.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-16`)).body;
    expect((await dom.patch("/me", { mutedNotifications: ["comments"] })).body.mutedNotifications).toEqual(["comments"]);
    const before = ctx.notifier.sent.length;
    await sub.post(`/occurrences/${occ.id}/comments`, { body: "Running late" });
    expect(ctx.notifier.sent.length).toBe(before);
    await sub.post(`/occurrences/${occ.id}/complete`);
    expect(ctx.notifier.sent.at(-1)!.push.body).toBe("Sub completed a task");
    expect((await dom.patch("/me", { mutedNotifications: ["nonsense"] })).status).toBe(400);
  });

  it("saves quiet hours on the account", async () => {
    const { dom } = await ctx.pair();
    const q = { start: "22:00", end: "07:00", timezone: "America/New_York" };
    expect((await dom.patch("/me", { quietHours: q })).body.quietHours).toEqual(q);
    expect((await dom.get("/me")).body.user.quietHours).toEqual(q);
    expect((await dom.patch("/me", { quietHours: { ...q, timezone: "Mars/Olympus" } })).status).toBe(400);
    expect((await dom.patch("/me", { quietHours: null })).body.quietHours).toBeNull();
  });
});

describe("calendar events", () => {
  it("lets either partner add plans and flags timed tasks they clash with", async () => {
    const { dom, sub, relId, subId } = await ctx.pair();
    await dom.post(`/relationships/${relId}/tasks`, task(subId)); // 21:00 New York on the 16th
    await dom.post(`/relationships/${relId}/tasks`, task(subId, { title: "All-day", dueTime: null }));
    const [timed] = (await sub.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-16`)).body.filter((o: { title: string }) => o.title !== "All-day");

    const dinner = { title: "Dinner with family", startsAt: "2026-10-16T19:00:00-04:00", endsAt: "2026-10-16T23:00:00-04:00" };
    // The Dominant's own plan doesn't touch the sub's tasks unless the sub is in on it.
    const solo = await dom.post(`/relationships/${relId}/events`, { ...dinner, title: "Poker night" });
    expect(solo.body.conflictIds).toEqual([]);
    await dom.del(`/events/${solo.body.id}`);
    const made = await sub.post(`/relationships/${relId}/events`, dinner);
    expect(made.status).toBe(201);
    expect(made.body.conflictIds).toEqual([timed.id]);
    expect(ctx.notifier.sent.at(-1)!.push.body).toBe("Sub added a plan on the calendar");

    expect((await dom.get(`/relationships/${relId}/events?from=2026-10-16&to=2026-10-16`)).body.map((e: { title: string }) => e.title)).toEqual(["Dinner with family"]);
    expect((await dom.get(`/relationships/${relId}/events?from=2026-10-20&to=2026-10-22`)).body).toEqual([]);
    expect((await ctx.as(crypto.randomUUID()).get(`/relationships/${relId}/events?from=2026-10-16&to=2026-10-16`)).status).toBe(404);

    // Only the author changes it; moving it off the task clears the clash.
    expect((await dom.patch(`/events/${made.body.id}`, { title: "Mine now" })).status).toBe(403);
    const moved = await sub.patch(`/events/${made.body.id}`, { startsAt: "2026-10-16T17:00:00-04:00", endsAt: "2026-10-16T20:00:00-04:00" });
    expect(moved.body.conflictIds).toEqual([]);
    expect((await sub.patch(`/events/${made.body.id}`, { endsAt: "2026-10-16T16:00:00-04:00" })).status).toBe(400);

    // A Dominant's plan tells the sub how many of their tasks it runs into.
    await dom.post(`/relationships/${relId}/events`, {
      title: "Away",
      startsAt: "2026-10-16T00:00:00-04:00",
      endsAt: "2026-10-17T00:00:00-04:00",
      allDay: true,
      withPartner: true,
    });
    expect(ctx.notifier.sent.at(-1)!.push.body).toBe("Dom added a plan on the calendar; it overlaps one of your tasks");

    expect((await dom.del(`/events/${made.body.id}`)).status).toBe(403);
    expect((await sub.del(`/events/${made.body.id}`)).status).toBe(204);
  });
  it("lets either partner dismiss a clash, keeping the task as it is", async () => {
    const { dom, sub, relId, subId } = await ctx.pair();
    await dom.post(`/relationships/${relId}/tasks`, task(subId));
    const [timed] = (await sub.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-16`)).body;
    const night = { title: "Night out", startsAt: "2026-10-16T19:00:00-04:00", endsAt: "2026-10-16T23:00:00-04:00" };
    const solo = await sub.post(`/relationships/${relId}/events`, night);
    // The Dom manages the sub's tasks, so a "Just me" plan's clash is theirs to wave through too.
    expect((await dom.post(`/events/${solo.body.id}/dismiss`, { occurrenceIds: [timed.id] })).body.conflictIds).toEqual([]);

    const together = await dom.post(`/relationships/${relId}/events`, { ...night, withPartner: true });
    expect(together.body.conflictIds).toEqual([timed.id]);
    expect((await dom.post(`/events/${together.body.id}/dismiss`, { occurrenceIds: [timed.id] })).body.conflictIds).toEqual([]);
    expect((await sub.get(`/relationships/${relId}/events?from=2026-10-16&to=2026-10-16`)).body.every((e: { conflictIds: string[] }) => !e.conflictIds.length)).toBe(true);
  });

  describe("email verification", () => {
    it("keeps unconfirmed email sign-ups out until they verify, but lets them ask for the email", async () => {
      const headers = { "x-dev-user": crypto.randomUUID(), "x-dev-email": "new@example.com", "x-dev-unverified": "1" };
      const me = await ctx.app.inject({ method: "GET", url: "/me", headers });
      expect(me.statusCode).toBe(403);
      expect(JSON.parse(me.body).details).toEqual({ code: "email_unverified" });

      const send = () => ctx.app.inject({ method: "POST", url: "/me/verification-email", headers, payload: {} });
      expect(JSON.parse((await send()).body)).toEqual({ sent: true });
      expect(ctx.verificationEmails.at(-1)).toBe("new@example.com");
      expect((await send()).statusCode).toBe(429);
      ctx.clock.now = new Date(ctx.clock.now.getTime() + 61_000);
      expect((await send()).statusCode).toBe(200);
    });
  });
});
