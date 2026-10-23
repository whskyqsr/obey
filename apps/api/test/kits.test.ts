import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setup } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  ctx = await setup();
});
afterAll(async () => ctx.close());

const base = { timezone: "America/New_York", start: "2026-10-16" };

describe("your own kits", () => {
  it("saves a copy of a dynamic's tasks with what they lean on, and adds it to another dynamic", async () => {
    ctx.clock.now = new Date("2026-10-16T12:00:00Z");
    const { dom, sub, relId, subId } = await ctx.pair();
    const lines = (await dom.post(`/relationships/${relId}/consequences`, { title: "Write lines", severity: 2 })).body;
    const movie = (await dom.post(`/relationships/${relId}/rewards`, { title: "Pick the movie", cost: 30 })).body;
    const rule = (await dom.post(`/relationships/${relId}/rules`, { title: "No phone in bed" })).body;
    await dom.post(`/relationships/${relId}/protocols`, { title: "Phone charges in the kitchen", ruleId: rule.id });
    const task = (
      await dom.post(`/relationships/${relId}/tasks`, {
        title: "Lights out",
        assigneeId: subId,
        schedule: { start: "2026-10-16", rule: { freq: "weekly", byWeekday: ["MO", "TU", "WE", "TH", "FR"], until: "2027-01-01" } },
        dueTime: "23:00",
        timezone: "America/New_York",
        points: 5,
        proofRequired: true,
        consequenceId: lines.id,
        steps: [{ id: randomUUID(), title: "Teeth" }],
      })
    ).body;

    expect((await sub.post(`/relationships/${relId}/kits`, { title: "Nope", tasks: [task.id] })).status).toBe(403);
    expect((await dom.post(`/relationships/${relId}/kits`, { title: "Empty" })).status).toBe(400);
    const saved = await dom.post(`/relationships/${relId}/kits`, { title: "Weeknight routine", description: "After the move.", tasks: [task.id], rules: [rule.id] });
    expect(saved.status).toBe(201);
    const kit = saved.body;
    // The task brings its consequence, the rule its protocol; nothing says who it was for or where it came from.
    expect(kit.items.map((i: { kind: string; title: string }) => `${i.kind}:${i.title}`).sort()).toEqual([
      "consequence:Write lines",
      "protocol:Phone charges in the kitchen",
      "rule:No phone in bed",
      "task:Lights out",
    ]);
    const t = kit.items.find((i: { kind: string }) => i.kind === "task");
    expect(t).toMatchObject({ repeat: { freq: "weekly", byWeekday: ["MO", "TU", "WE", "TH", "FR"] }, dueTime: "23:00", points: 5, proofRequired: true, steps: ["Teeth"] });
    expect(t.repeat.until).toBeUndefined();
    expect(JSON.stringify(kit)).not.toContain(subId);
    expect(JSON.stringify(kit)).not.toContain(task.id);
    expect((await dom.get("/me/kits")).body.map((k: { id: string }) => k.id)).toEqual([kit.id]);
    expect((await sub.get("/me/kits")).body).toEqual([]);

    // Into a second dynamic of the same Dominant: the task points at the consequence added with it.
    const sub2 = ctx.as(randomUUID(), "Jo");
    const rel2 = (await dom.post("/relationships", { name: "Others", role: "dominant" })).body;
    await sub2.post("/relationships/join", { code: (await dom.post(`/relationships/${rel2.id}/invites`)).body.code, role: "submissive" });
    const jo = (await sub2.get("/me")).body.user.id;
    const added = await dom.post(`/relationships/${rel2.id}/kits/${kit.id}`, { ...base, items: [t.key], assigneeId: jo });
    expect(added.body).toEqual({ tasks: 1, rules: 0, protocols: 0, rewards: 0, consequences: 1, drafts: 1 });
    await dom.post(`/relationships/${rel2.id}/tasks/send`, {});
    const [newTask] = (await sub2.get(`/relationships/${rel2.id}/tasks`)).body;
    const [newLines] = (await sub2.get(`/relationships/${rel2.id}/consequences`)).body;
    expect(newTask).toMatchObject({ title: "Lights out", consequenceId: newLines.id, points: 5, proofRequired: true, dueTime: "23:00" });
    expect(newTask.steps.map((s: { title: string }) => s.title)).toEqual(["Teeth"]);
    // Someone else's kit can't be used by id.
    const other = ctx.as(randomUUID(), "Other");
    const rel3 = (await other.post("/relationships", { name: "Mine", role: "dominant" })).body;
    expect((await other.post(`/relationships/${rel3.id}/kits/${kit.id}`, { ...base })).status).toBe(404);

    // Trimming keeps what the remaining items need; a reward picked on its own comes along too.
    const both = (await dom.post(`/relationships/${relId}/kits`, { title: "Weekend", tasks: [task.id], rewards: [movie.id] })).body;
    const trimmed = await dom.patch(`/kits/${both.id}`, { title: "Weekend service", keep: [both.items.find((i: { kind: string }) => i.kind === "task").key] });
    expect(trimmed.body.title).toBe("Weekend service");
    expect(trimmed.body.items.map((i: { kind: string }) => i.kind).sort()).toEqual(["consequence", "task"]);
    expect((await dom.del(`/kits/${both.id}`)).status).toBe(204);
    expect((await dom.get("/me/kits")).body).toHaveLength(1);
  });

  it("shares by a code anyone can open, save or add, until sharing stops", async () => {
    const { dom, relId } = await ctx.pair();
    const rule = (await dom.post(`/relationships/${relId}/rules`, { title: "Be honest, always" })).body;
    const kit = (await dom.post(`/relationships/${relId}/kits`, { title: "Rules", rules: [rule.id] })).body;
    expect(kit.shareCode).toBeNull();
    const shared = (await dom.post(`/kits/${kit.id}/share`)).body;
    expect(shared.shareCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    // Sharing again keeps the same code.
    expect((await dom.post(`/kits/${kit.id}/share`)).body.shareCode).toBe(shared.shareCode);

    const alex = ctx.as(randomUUID(), "Alex");
    const code = shared.shareCode as string;
    const dashed = `${code.slice(0, 3)}-${code.slice(3)}`.toLowerCase();
    const seen = await alex.get(`/shared-kits/${dashed}`);
    expect(seen.body).toEqual({ code, title: "Rules", description: "", items: kit.items });
    expect(JSON.stringify(seen.body)).not.toContain("Dom");
    const copy = await alex.post(`/shared-kits/${code}/save`);
    expect(copy.status).toBe(201);
    expect(copy.body).toMatchObject({ title: "Rules", shareCode: null });
    const rel = (await alex.post("/relationships", { name: "Ours", role: "dominant" })).body;
    expect((await alex.post(`/relationships/${rel.id}/shared-kits/${code}`, base)).body).toMatchObject({ rules: 1 });
    // Only the owner shares or stops sharing.
    expect((await alex.del(`/kits/${kit.id}/share`)).status).toBe(404);

    await dom.del(`/kits/${kit.id}/share`);
    expect((await alex.get(`/shared-kits/${code}`)).status).toBe(404);
    expect((await alex.get("/shared-kits/not-a-code")).status).toBe(404);
    // The saved copy stays.
    expect((await alex.get("/me/kits")).body).toHaveLength(1);
  });
});
