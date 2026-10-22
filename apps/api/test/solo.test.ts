import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setup } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  ctx = await setup();
});
afterAll(async () => ctx.close());

describe("solo mode", () => {
  it("lets someone on their own set their own tasks, then hands it all to the Dominant who joins", async () => {
    ctx.clock.now = new Date("2026-10-22T12:00:00Z");
    const sub = ctx.as(randomUUID(), "Kitten");
    const dom = ctx.as(randomUUID(), "Sam");
    const rel = (await sub.post("/relationships", { role: "submissive" })).body;
    const subId = (await sub.get("/me")).body.user.id as string;

    const task = await sub.post(`/relationships/${rel.id}/tasks`, {
      title: "No phone after 10",
      assigneeId: subId,
      schedule: { start: "2026-10-22" },
      dueTime: "22:00",
      timezone: "America/New_York",
      points: 5,
    });
    expect(task.status).toBe(201);
    expect((await sub.post(`/relationships/${rel.id}/rules`, { title: "Say please" })).status).toBe(201);
    const [occ] = (await sub.get(`/relationships/${rel.id}/occurrences?from=2026-10-22&to=2026-10-22`)).body as { id: string }[];
    expect((await sub.post(`/occurrences/${occ!.id}/complete`)).body.status).toBe("completed");
    expect((await sub.get("/me")).body.relationships[0].soloSetup).toBeNull();

    // Their invite still asks for a Dominant: they act as a switch only while they're alone.
    const invite = (await sub.post(`/relationships/${rel.id}/invites`)).body;
    expect(invite.role).toBe("dominant");
    ctx.clock.now = new Date("2026-10-22T13:00:00Z");
    expect((await dom.post("/relationships/join", { code: invite.code, role: "dominant" })).status).toBeLessThan(300);

    const setup = (await dom.get("/me")).body.relationships[0].soloSetup;
    expect(setup).toMatchObject({ setById: subId, tasks: 1, rules: 1, rewards: 0, consequences: 0 });
    // Now there's a Dominant, the sub is back to being a sub.
    expect((await sub.post(`/relationships/${rel.id}/rules`, { title: "Kneel" })).status).toBe(403);
    expect((await dom.post(`/relationships/${rel.id}/rules`, { title: "Kneel" })).status).toBe(201);
  });
});
