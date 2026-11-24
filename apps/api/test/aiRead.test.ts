import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setup } from "./helpers.js";
import { connect, tool } from "./aiHelpers.js";

let ctx: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  ctx = await setup();
});
afterAll(async () => ctx.close());

/** A pair who have both allowed AI access, each with an app connected, and a little in their dynamic. */
async function connectedPair() {
  const p = await ctx.pair();
  await p.dom.put(`/relationships/${p.relId}/ai-access`, { allowed: true });
  await p.sub.put(`/relationships/${p.relId}/ai-access`, { allowed: true });
  const domToken = (await connect(ctx, p.dom)).access_token;
  const subToken = (await connect(ctx, p.sub)).access_token;
  await p.dom.post(`/relationships/${p.relId}/tasks`, {
    title: "Water",
    assigneeId: p.subId,
    schedule: { start: "2026-10-16" },
    dueTime: "20:00",
    timezone: "America/New_York",
    points: 5,
  });
  await p.dom.post(`/relationships/${p.relId}/rules`, { title: "Stay hydrated" });
  await p.dom.post(`/relationships/${p.relId}/protocols`, { title: "64 oz a day" });
  return { ...p, domToken, subToken };
}

describe("MCP read tools stay inside what the app shows", () => {
  it("never shows a Dominant the submissive's private journal entries", async () => {
    const { relId, dom, sub, domToken, subToken } = await connectedPair();
    await sub.post(`/relationships/${relId}/notes`, { kind: "journal", title: "Just mine", bodyMd: "private words", visibility: "private" });
    await sub.post(`/relationships/${relId}/notes`, { kind: "journal", title: "For us", bodyMd: "shared words", visibility: "shared" });

    const domSees = (await tool(ctx, domToken, "list_notes", { relationshipId: relId, kind: "journal" })).data as { title: string }[];
    expect(domSees.map((n) => n.title)).toEqual(["For us"]);
    expect(JSON.stringify(domSees)).not.toContain("private words");
    const subSees = (await tool(ctx, subToken, "list_notes", { relationshipId: relId, kind: "journal" })).data as { title: string }[];
    expect(subSees.map((n) => n.title).sort()).toEqual(["For us", "Just mine"]);

    // Exactly what the app gives each of them.
    const appDom = ((await dom.get(`/relationships/${relId}/notes`)).body as { kind: string }[]).filter((n) => n.kind === "journal");
    expect(domSees).toEqual(appDom);
  });

  it("returns the same as the app's own routes, for the Dominant and the submissive", async () => {
    const { relId, dom, sub, domToken, subToken } = await connectedPair();
    const cases: [string, Record<string, unknown>, string][] = [
      ["list_tasks", {}, `/relationships/${relId}/tasks`],
      ["get_tasks_due", { from: "2026-10-16", to: "2026-10-20" }, `/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-20`],
      ["get_calendar", { from: "2026-10-16", to: "2026-10-20" }, `/relationships/${relId}/events?from=2026-10-16&to=2026-10-20`],
      ["list_rules", {}, `/relationships/${relId}/rules`],
      ["list_protocols", {}, `/relationships/${relId}/protocols`],
      ["get_balances", {}, `/relationships/${relId}/balances`],
      ["get_limits", {}, `/relationships/${relId}/limit-list`],
      ["get_moods", {}, `/relationships/${relId}/moods?days=30`],
    ];
    for (const [person, token] of [
      [dom, domToken],
      [sub, subToken],
    ] as const) {
      for (const [name, args, url] of cases) {
        const viaAi = await tool(ctx, token, name, { relationshipId: relId, ...args });
        const app = await person.get(url);
        expect(viaAi.isError, name).toBeFalsy();
        // The only thing MCP drops is where places are.
        expect(JSON.stringify(viaAi.data), name).toBe(JSON.stringify(stripPlaces(app.body)));
      }
    }
  });

  it("hides what a feature switch hides in the app, even where the route would answer", async () => {
    const { relId, dom, domToken } = await connectedPair();
    await dom.patch(`/relationships/${relId}`, { features: { rules: false, journal: false } });
    expect((await dom.get(`/relationships/${relId}/rules`)).status).toBe(200);
    const rules = await tool(ctx, domToken, "list_rules", { relationshipId: relId });
    expect(rules.isError).toBe(true);
    expect(rules.content[0]!.text).toBe("Rules are switched off for this dynamic.");
    expect((await tool(ctx, domToken, "list_notes", { relationshipId: relId, kind: "journal" })).isError).toBe(true);
  });

  it("reaches nothing in a dynamic once a partner withdraws consent", async () => {
    const { relId, sub, domToken } = await connectedPair();
    await sub.put(`/relationships/${relId}/ai-access`, { allowed: false });
    for (const name of ["list_tasks", "list_rules", "get_balances"]) {
      const r = await tool(ctx, domToken, name, { relationshipId: relId });
      expect(r.isError, name).toBe(true);
      expect(r.content[0]!.text, name).toBe("not found");
    }
  });

  it("keeps where tasks happen out of what it returns", async () => {
    const { relId, domToken } = await connectedPair();
    const tasks = (await tool(ctx, domToken, "list_tasks", { relationshipId: relId })).data as Record<string, unknown>[];
    expect(tasks.length).toBeGreaterThan(0);
    for (const t of tasks) expect(Object.keys(t)).not.toContain("placeId");
  });

  it("lists what's waiting: More time requests and tasks to review", async () => {
    const { relId, sub, subId, domToken } = await connectedPair();
    const [occ] = (await sub.get(`/relationships/${relId}/occurrences?from=2026-10-16&to=2026-10-16`)).body as { id: string }[];
    const asked = await sub.post(`/occurrences/${occ!.id}/reschedule`, { dueAt: "2026-10-17T00:30:00Z", reason: "Late shift" });
    expect(asked.status).toBeLessThan(300);
    const pending = (await tool(ctx, domToken, "get_pending", { relationshipId: relId, today: "2026-10-16" })).data;
    expect(pending.moreTimeRequests).toHaveLength(1);
    expect(pending.moreTimeRequests[0]).toMatchObject({ requestedBy: subId });
  });
});

const PLACE_KEYS = new Set(["placeId", "stayMinutes", "stayUntil", "place", "lat", "lng"]);
function stripPlaces(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripPlaces);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([k]) => !PLACE_KEYS.has(k)).map(([k, v]) => [k, stripPlaces(v)]));
  return value;
}
