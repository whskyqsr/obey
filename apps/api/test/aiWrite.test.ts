import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { aiCalls } from "../src/db/schema.js";
import { aiRouteAllowed } from "../src/mcp/server.js";
import { setup } from "./helpers.js";
import { connect, mcp, tool } from "./aiHelpers.js";

let ctx: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  ctx = await setup();
});
afterAll(async () => ctx.close());

async function connectedPair() {
  const p = await ctx.pair();
  await p.dom.put(`/relationships/${p.relId}/ai-access`, { allowed: true });
  await p.sub.put(`/relationships/${p.relId}/ai-access`, { allowed: true });
  return { ...p, domToken: (await connect(ctx, p.dom)).access_token, subToken: (await connect(ctx, p.sub)).access_token };
}

const task = (relationshipId: string, assigneeId: string) => ({
  relationshipId,
  title: "Water",
  assigneeId,
  start: "2026-10-16",
  dueTime: "20:00",
  timezone: "America/New_York",
  repeat: { freq: "daily" },
  points: 5,
});

describe("MCP write tools stay inside what the app allows", () => {
  it("lets a Dominant set, change and delete tasks, and refuses a submissive the same way the app does", async () => {
    const { relId, subId, domToken, subToken } = await connectedPair();
    const refused = await tool(ctx, subToken, "create_task", task(relId, subId));
    expect(refused.isError).toBe(true);
    expect(refused.content[0]!.text).toBe("only a Dominant can do this");

    const made = await tool(ctx, domToken, "create_task", task(relId, subId));
    expect(made.isError).toBeFalsy();
    const taskId = made.data.id as string;
    expect((await tool(ctx, domToken, "edit_task", { relationshipId: relId, taskId, points: 8 })).data.points).toBe(8);
    expect((await tool(ctx, subToken, "delete_task", { relationshipId: relId, taskId })).isError).toBe(true);
    expect((await tool(ctx, domToken, "delete_task", { relationshipId: relId, taskId })).data).toEqual({ done: true });
  });

  it("runs More time through the dynamic's own rules: the submissive asks, the Dominant answers", async () => {
    const { relId, subId, domToken, subToken } = await connectedPair();
    await tool(ctx, domToken, "create_task", task(relId, subId));
    const [occ] = (await tool(ctx, subToken, "get_tasks_due", { relationshipId: relId, from: "2026-10-16", to: "2026-10-16" })).data as { id: string }[];

    const asked = await tool(ctx, subToken, "request_more_time", { relationshipId: relId, occurrenceId: occ!.id, delayHours: 2, reason: "Late shift" });
    expect(asked.data.applied).toBe(false);
    const pending = (await tool(ctx, domToken, "get_pending", { relationshipId: relId, today: "2026-10-16" })).data;
    const requestId = pending.moreTimeRequests[0].id as string;

    // The submissive can't approve their own request.
    expect((await tool(ctx, subToken, "decide_request", { relationshipId: relId, kind: "more_time", requestId, approve: true })).isError).toBe(true);
    const decided = await tool(ctx, domToken, "decide_request", { relationshipId: relId, kind: "more_time", requestId, approve: true });
    expect(decided.data.request.status).toBe("approved");
  });

  it("keeps plans to their author", async () => {
    const { relId, domToken, subToken } = await connectedPair();
    const plan = await tool(ctx, subToken, "add_plan", { relationshipId: relId, title: "Dinner with Sam", startsAt: "2026-10-17T19:00:00-04:00", endsAt: "2026-10-17T22:00:00-04:00" });
    const planId = plan.data.id as string;
    expect((await tool(ctx, domToken, "delete_plan", { relationshipId: relId, planId })).isError).toBe(true);
    expect((await tool(ctx, domToken, "edit_plan", { relationshipId: relId, planId, title: "Renamed" })).isError).toBe(true);
    expect((await tool(ctx, subToken, "delete_plan", { relationshipId: relId, planId })).data).toEqual({ done: true });
  });

  it("follows note permissions: private entries stay private and a Dominant can turn off the submissive's notes", async () => {
    const { relId, dom, domToken, subToken } = await connectedPair();
    const entry = await tool(ctx, subToken, "add_note", { relationshipId: relId, kind: "journal", body: "only mine", visibility: "private" });
    const noteId = entry.data.id as string;
    // The Dominant can't see it, so can't touch it either.
    for (const name of ["edit_note", "delete_note"]) {
      const r = await tool(ctx, domToken, name, { relationshipId: relId, noteId, body: "changed" });
      expect(r.isError, name).toBe(true);
      expect(r.content[0]!.text, name).toBe("not found");
    }
    await dom.patch(`/relationships/${relId}`, { subNotes: false });
    const blocked = await tool(ctx, subToken, "add_note", { relationshipId: relId, body: "a note" });
    expect(blocked.isError).toBe(true);
    expect(blocked.content[0]!.text).toBe("your Dominant hasn't turned on writing notes");
    // Journal entries have their own switch, as in the app.
    expect((await tool(ctx, subToken, "add_note", { relationshipId: relId, kind: "journal", body: "still allowed" })).isError).toBeFalsy();
    await dom.patch(`/relationships/${relId}`, { features: { journal: false } });
    expect((await tool(ctx, subToken, "add_note", { relationshipId: relId, kind: "journal", body: "now off" })).isError).toBe(true);
  });

  it("adds, changes and deletes rules and protocols for a Dominant only, and not when they're switched off", async () => {
    const { relId, dom, domToken, subToken } = await connectedPair();
    expect((await tool(ctx, subToken, "add_rule", { relationshipId: relId, title: "Kneel" })).isError).toBe(true);
    const rule = (await tool(ctx, domToken, "add_rule", { relationshipId: relId, title: "Stay hydrated" })).data;
    const protocol = (await tool(ctx, domToken, "add_protocol", { relationshipId: relId, title: "64 oz a day", ruleId: rule.id })).data;
    expect(protocol.ruleId).toBe(rule.id);
    expect((await tool(ctx, domToken, "edit_rule", { relationshipId: relId, id: rule.id, title: "Drink water" })).data.title).toBe("Drink water");
    expect((await tool(ctx, domToken, "delete_protocol", { relationshipId: relId, id: protocol.id })).data).toEqual({ done: true });

    await dom.patch(`/relationships/${relId}`, { features: { rules: false } });
    const off = await tool(ctx, domToken, "delete_rule", { relationshipId: relId, id: rule.id });
    expect(off.content[0]!.text).toBe("Rules are switched off for this dynamic.");
  });

  it("can't change anything in an ended dynamic", async () => {
    const { relId, sub, domToken } = await connectedPair();
    await sub.post(`/relationships/${relId}/leave`);
    const r = await tool(ctx, domToken, "add_plan", { relationshipId: relId, title: "Anything", startsAt: "2026-10-17T19:00:00-04:00", endsAt: "2026-10-17T20:00:00-04:00" });
    expect(r.isError).toBe(true);
  });

  it("logs the dynamic a call really reached, whatever dynamic it named", async () => {
    const { relId, domToken, subId } = await connectedPair();
    const other = await connectedPair();
    const made = await tool(ctx, domToken, "create_task", task(relId, subId));
    const callsBefore = await ctx.db.select().from(aiCalls).where(eq(aiCalls.relationshipId, relId));
    // Names the other dynamic, but acts on a task in this one: refused, since that task isn't in the list named.
    expect((await tool(ctx, domToken, "delete_task", { relationshipId: other.relId, taskId: made.data.id })).isError).toBe(true);
    const callsAfter = await ctx.db.select().from(aiCalls).where(eq(aiCalls.relationshipId, relId));
    expect(callsAfter.length).toBe(callsBefore.length);
    expect(callsBefore.some((c) => c.tool === "create_task" && c.ok)).toBe(true);

    // Names the other dynamic but moves a task in this one: logged here, where both partners will see it.
    const [occ] = (await tool(ctx, domToken, "get_tasks_due", { relationshipId: relId, from: "2026-10-16", to: "2026-10-16" })).data as { id: string }[];
    expect((await tool(ctx, domToken, "request_more_time", { relationshipId: other.relId, occurrenceId: occ!.id, delayHours: 1 })).isError).toBeFalsy();
    const moved = await ctx.db.select().from(aiCalls).where(eq(aiCalls.tool, "request_more_time"));
    expect(moved.map((c) => c.relationshipId)).toContain(relId);
    expect(moved.map((c) => c.relationshipId)).not.toContain(other.relId);
  });

  it("leaves invites, blocking, safe calls, leaving, account changes and AI access to the app", async () => {
    const { domToken } = await connectedPair();
    const names = ((await mcp(ctx, domToken, "tools/list")).body.result.tools as { name: string; annotations?: { destructiveHint?: boolean } }[]).map((t) => t.name);
    for (const word of ["invite", "block", "safe", "leave", "account", "access"]) expect(names.filter((n) => n.includes(word)), word).toEqual([]);
    for (const route of [
      "POST /relationships/:id/invites",
      "POST /relationships/join",
      "POST /relationships/:id/leave",
      "POST /relationships/:id/safe-calls",
      "PATCH /me",
      "DELETE /me",
      "PUT /relationships/:id/ai-access",
      "PATCH /relationships/:id",
      "GET /photos/:id",
      "GET /chastity/:id/keybox",
      "GET /relationships/:id/places",
    ]) {
      const [method, url] = route.split(" ");
      expect(aiRouteAllowed(method!, url), route).toBe(false);
    }
  });

  it("marks deletes as destructive so clients ask first", async () => {
    const { domToken } = await connectedPair();
    const tools = (await mcp(ctx, domToken, "tools/list")).body.result.tools as { name: string; annotations?: { destructiveHint?: boolean } }[];
    for (const t of tools.filter((x) => x.name.startsWith("delete_"))) expect(t.annotations?.destructiveHint, t.name).toBe(true);
  });
});
