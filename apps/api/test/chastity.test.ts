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
const keybox = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const photo = (headers: Record<string, string>, url: string, body = keybox) => ctx.app.inject({ method: "POST", url, payload: body, headers: { ...headers, "content-type": "image/jpeg" } });
const get = (headers: Record<string, string>, url: string) => ctx.app.inject({ method: "GET", url, headers });

describe("chastity", () => {
  it("is off until switched on, starts when the wearer seals the keybox, and keeps the code sealed until release", async () => {
    ctx.clock.now = new Date("2026-10-22T20:00:00Z");
    const { dom, sub, relId, domId, subId } = await ctx.pair();
    expect((await dom.get("/me")).body.relationships[0].features.chastity).toBe(false);
    expect((await dom.post(`/relationships/${relId}/chastity`, {})).status).toBe(403);
    await dom.patch(`/relationships/${relId}`, { features: { chastity: true } });

    expect((await sub.post(`/relationships/${relId}/chastity`, {})).status).toBe(403);
    const asked = await dom.post(`/relationships/${relId}/chastity`, { minutes: 3 * 1440, keyMode: "keybox", hideTime: true });
    expect(asked.status).toBe(201);
    expect(asked.body).toMatchObject({ status: "pending", wearerId: subId, keyholderId: domId, endsAt: null });
    // A hidden length stays off the lock screen too.
    expect(lastTo(subId)?.body).toMatch(/wants you locked$/);
    expect((await dom.post(`/relationships/${relId}/chastity`, {})).status).toBe(409);
    const lockId = asked.body.id;

    // Locking up with a keybox needs the photo of the code.
    expect((await sub.post(`/chastity/${lockId}/lock`, {})).status).toBe(415);
    const locked = await photo(sub.headers, `/chastity/${lockId}/lock`);
    expect(locked.statusCode).toBe(200);
    expect(locked.json()).toMatchObject({ status: "active", hasKeybox: true, canSeeKeybox: false, endsAt: null, timeHidden: true });
    expect(lastTo(domId)?.body).toMatch(/is locked/);
    const domView = (await dom.get(`/relationships/${relId}/chastity`)).body;
    expect(domView.open[0]).toMatchObject({ endsAt: "2026-10-25T20:00:00.000Z", canSeeKeybox: true });
    expect((await get(dom.headers, `/chastity/${lockId}/keybox`)).rawPayload.equals(keybox)).toBe(true);
    expect((await get(sub.headers, `/chastity/${lockId}/keybox`)).statusCode).toBe(403);

    // A Red call shows the wearer the code at once.
    const call = (await sub.post(`/relationships/${relId}/safe-calls`, { level: "red" })).body;
    expect((await get(sub.headers, `/chastity/${lockId}/keybox`)).statusCode).toBe(200);
    await sub.post(`/safe-calls/${call.id}/clear`);
    expect((await get(sub.headers, `/chastity/${lockId}/keybox`)).statusCode).toBe(403);

    ctx.clock.now = new Date("2026-10-22T21:00:00Z");
    // Time changes: only the keyholder; the wearer who can't see the time isn't told how much.
    expect((await sub.post(`/chastity/${lockId}/time`, { minutes: -60 })).status).toBe(403);
    expect((await dom.post(`/chastity/${lockId}/time`, { minutes: 1440, note: "Cheek" })).body.endsAt).toBe("2026-10-26T20:00:00.000Z");
    expect(lastTo(subId)?.body).toMatch(/added time to your lock$/);
    const subEvents = (await sub.get(`/relationships/${relId}/chastity`)).body.events;
    expect(subEvents[0]).toMatchObject({ kind: "time", minutes: null, note: "Cheek" });

    // Time's up: the lock ends and the wearer can open the box.
    ctx.clock.now = new Date("2026-10-26T20:01:00Z");
    await runJobs(ctx.db, ctx.notifier, ctx.clock.now, opts);
    expect(lastTo(subId)?.body).toMatch(/keybox code is yours/);
    const after = (await sub.get(`/relationships/${relId}/chastity`)).body;
    expect(after.open).toEqual([]);
    expect(after.past[0]).toMatchObject({ status: "ended", endReason: "time", canSeeKeybox: true, endsAt: "2026-10-26T20:00:00.000Z" });
    expect((await get(sub.headers, `/chastity/${lockId}/keybox`)).statusCode).toBe(200);
  });

  it("handles release and hygiene-break asks, and photo checks as tasks", async () => {
    ctx.clock.now = new Date("2026-10-22T20:00:00Z");
    const { dom, sub, relId, domId, subId } = await ctx.pair();
    await dom.patch(`/relationships/${relId}`, { features: { chastity: true } });
    const lockId = (await dom.post(`/relationships/${relId}/chastity`, {})).body.id;
    expect((await sub.post(`/chastity/${lockId}/lock`, {})).body).toMatchObject({ status: "active", endsAt: null, keyMode: "keyholder" });
    // Open-ended: no end to move.
    expect((await dom.post(`/chastity/${lockId}/time`, { minutes: 60 })).status).toBe(409);

    ctx.clock.now = new Date("2026-10-22T20:05:00Z");
    const brk = (await sub.post(`/chastity/${lockId}/asks`, { kind: "break" })).body;
    expect(brk).toMatchObject({ kind: "break", status: "pending", minutes: 20 });
    expect((await sub.post(`/chastity/${lockId}/asks`, { kind: "break" })).status).toBe(409);
    expect(lastTo(domId)?.body).toMatch(/asked for a hygiene break/);
    expect((await dom.post(`/chastity/asks/${brk.id}/decide`, { approve: true, minutes: 15 })).body).toMatchObject({ status: "break", breakEndsAt: "2026-10-22T20:20:00.000Z" });

    // Not back in time: the keyholder hears once; relocking closes the break.
    ctx.clock.now = new Date("2026-10-22T20:25:00Z");
    await runJobs(ctx.db, ctx.notifier, ctx.clock.now, opts);
    expect(lastTo(domId)?.body).toMatch(/haven't relocked/);
    const sent = ctx.notifier.sent.length;
    await runJobs(ctx.db, ctx.notifier, ctx.clock.now, opts);
    expect(ctx.notifier.sent.length).toBe(sent);
    expect((await sub.post(`/chastity/${lockId}/lock`, {})).body.status).toBe("active");
    const log = (await dom.get(`/relationships/${relId}/chastity`)).body.events;
    expect(log.map((e: { kind: string; status: string | null }) => `${e.kind}:${e.status}`)).toEqual(["relocked:null", "break:done", "started:null"]);

    // A photo check is a task with photo proof, due when asked.
    const ask = await dom.post(`/chastity/${lockId}/photo-ask`, { dueAt: "2026-10-23T01:00:00Z", timezone: "America/New_York" });
    expect(ask.status).toBe(201);
    const task = (await dom.get(`/relationships/${relId}/tasks`)).body.find((t: { id: string }) => t.id === ask.body.taskId);
    expect(task).toMatchObject({ assigneeId: subId, proofRequired: true, approvalRequired: true, dueTime: "21:00" });

    // Release: declined, then approved, which ends the lock.
    const rel1 = (await sub.post(`/chastity/${lockId}/asks`, { kind: "release", note: "Please" })).body;
    await dom.post(`/chastity/asks/${rel1.id}/decide`, { approve: false });
    expect(lastTo(subId)?.body).toMatch(/not yet/);
    const rel2 = (await sub.post(`/chastity/${lockId}/asks`, { kind: "release" })).body;
    expect((await dom.post(`/chastity/asks/${rel2.id}/decide`, { approve: true })).body).toMatchObject({ status: "ended", endReason: "released" });
  });

  it("adds time for a missed task's consequence, takes it back if the miss is undone, and takes time off for a reward", async () => {
    ctx.clock.now = new Date("2026-10-22T12:00:00Z");
    const { dom, sub, relId, subId } = await ctx.pair();
    await dom.patch(`/relationships/${relId}`, { features: { chastity: true } });
    const extra = (await dom.post(`/relationships/${relId}/consequences`, { title: "Extra day locked", lockMinutes: 1440 })).body;
    expect(extra.lockMinutes).toBe(1440);
    const early = (await dom.post(`/relationships/${relId}/rewards`, { title: "Early out", cost: 0, lockMinutes: 360 })).body;
    await dom.post(`/relationships/${relId}/tasks`, {
      title: "Write lines",
      assigneeId: subId,
      schedule: { start: "2026-10-22" },
      dueTime: "20:00",
      timezone: "America/New_York",
      consequenceId: extra.id,
    });
    const lockId = (await dom.post(`/relationships/${relId}/chastity`, { minutes: 2 * 1440 })).body.id;
    await sub.post(`/chastity/${lockId}/lock`, {});
    const endsAt = async () => (await dom.get(`/relationships/${relId}/chastity`)).body.open[0].endsAt;
    expect(await endsAt()).toBe("2026-10-24T12:00:00.000Z");

    ctx.clock.now = new Date("2026-10-23T01:00:00Z");
    await runJobs(ctx.db, ctx.notifier, ctx.clock.now, opts);
    expect(await endsAt()).toBe("2026-10-25T12:00:00.000Z");
    // No task for it: lock time isn't something to do.
    expect((await dom.get(`/relationships/${relId}/tasks`)).body.map((t: { title: string }) => t.title)).toEqual(["Write lines"]);
    await runJobs(ctx.db, ctx.notifier, ctx.clock.now, opts);
    expect(await endsAt()).toBe("2026-10-25T12:00:00.000Z");

    // The Dominant excuses the miss: the day comes off again.
    const [occ] = (await dom.get(`/relationships/${relId}/occurrences?from=2026-10-22&to=2026-10-22`)).body;
    expect(occ.status).toBe("missed");
    expect((await dom.patch(`/occurrences/${occ.id}`, { status: "excused" })).status).toBe(200);
    expect(await endsAt()).toBe("2026-10-24T12:00:00.000Z");

    // Handing the consequence out on its own adds the time straight away.
    expect((await dom.post(`/consequences/${extra.id}/assign`, { assigneeId: subId, date: "2026-10-23", timezone: "America/New_York" })).status).toBe(204);
    expect(await endsAt()).toBe("2026-10-25T12:00:00.000Z");

    ctx.clock.now = new Date("2026-10-23T02:00:00Z");
    const redeemed = (await sub.post(`/rewards/${early.id}/redeem`, {})).body;
    expect(await endsAt()).toBe("2026-10-25T12:00:00.000Z");
    await dom.post(`/ledger/${redeemed.id}/redeemed`, {});
    expect(await endsAt()).toBe("2026-10-25T06:00:00.000Z");
    const log = (await dom.get(`/relationships/${relId}/chastity`)).body.events.filter((e: { kind: string }) => e.kind === "time");
    expect(log.map((e: { minutes: number; note: string }) => [e.minutes, e.note])).toEqual([
      [-360, "Redeemed “Early out”"],
      [1440, "Extra day locked"],
    ]);
  });
});
