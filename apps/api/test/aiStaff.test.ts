import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setup } from "./helpers.js";
import { connect, mcp, tool } from "./aiHelpers.js";

let ctx: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  ctx = await setup();
});
afterAll(async () => ctx.close());

describe("MCP staff tools", () => {
  it("are only listed on a staff connection, and handle reports without reading any dynamic", async () => {
    const { dom, subId } = await ctx.pair();
    await dom.post("/reports", { subjectId: subId, reason: "other", details: "Spam" });

    const plain = (await connect(ctx, dom, "fealty fealty:staff")).access_token;
    const plainTools = ((await mcp(ctx, plain, "tools/list")).body.result.tools as { name: string }[]).map((t) => t.name);
    expect(plainTools.filter((n) => n.startsWith("staff_"))).toEqual([]);

    const mod = ctx.as(randomUUID(), "Mod");
    (mod.headers as Record<string, string>)["x-dev-email"] = "mod@example.com";
    const staff = (await connect(ctx, mod, "fealty fealty:staff")).access_token;
    const reports = (await tool(ctx, staff, "staff_list_reports")).data as { id: string; details: string }[];
    const report = reports.find((r) => r.details === "Spam")!;
    expect(report).toBeTruthy();
    expect((await tool(ctx, staff, "staff_resolve_report", { reportId: report.id })).data).toEqual({ ok: true });
    expect(((await tool(ctx, staff, "staff_list_reports")).data as { id: string }[]).map((r) => r.id)).not.toContain(report.id);

    const account = (await tool(ctx, staff, "staff_lookup_account", { email: "mod@example.com" })).data;
    expect(account[0]).toMatchObject({ displayName: "Mod", dynamics: { live: 0, ended: 0 } });
  });
});
