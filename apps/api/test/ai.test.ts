import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requestScope, requireMember } from "../src/services/access.js";
import { knownApp } from "../src/services/aiAccess.js";
import { setup } from "./helpers.js";
import { REDIRECT, connect, mcp, tool } from "./aiHelpers.js";

let ctx: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  ctx = await setup();
});
afterAll(async () => ctx.close());

describe("AI access over MCP", () => {
  it("advertises OAuth and asks for a token", async () => {
    const meta = await ctx.app.inject({ method: "GET", url: "/.well-known/oauth-authorization-server" });
    expect(meta.json()).toMatchObject({ code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none"] });
    expect((await ctx.app.inject({ method: "GET", url: "/.well-known/oauth-protected-resource/mcp" })).json().resource).toMatch(/\/mcp$/);
    const res = await mcp(ctx, "nope", "tools/list");
    expect(res.status).toBe(401);
    expect(res.headers["www-authenticate"]).toContain("resource_metadata=");
  });

  it("only reaches a dynamic once every partner allows it, and either can cut it off", async () => {
    const { dom, sub, relId } = await ctx.pair();
    const { access_token } = await connect(ctx, dom);

    const tools = await mcp(ctx, access_token, "tools/list");
    expect(tools.body.result.tools.map((t: { name: string }) => t.name)).toContain("list_dynamics");

    expect((await tool(ctx, access_token, "list_dynamics")).data.dynamics).toEqual([]);
    await dom.put(`/relationships/${relId}/ai-access`, { allowed: true });
    // The Dominant alone can't open the submissive's side of things.
    expect((await tool(ctx, access_token, "list_dynamics")).data.dynamics).toEqual([]);
    expect((await sub.put(`/relationships/${relId}/ai-access`, { allowed: true })).body).toEqual({ allowed: true, reachable: true });

    const listed = (await tool(ctx, access_token, "list_dynamics")).data;
    expect(listed.dynamics).toHaveLength(1);
    expect(listed.dynamics[0]).toMatchObject({ id: relId, yourRole: "dominant", partners: [{ name: "Sub", role: "submissive" }] });

    // The submissive changes their mind: the Dominant's app loses the dynamic at once.
    await sub.put(`/relationships/${relId}/ai-access`, { allowed: false });
    expect((await tool(ctx, access_token, "list_dynamics")).data.dynamics).toEqual([]);

    // Both partners see the app and the calls it made, without their content.
    const access = (await sub.get(`/relationships/${relId}/ai-access`)).body;
    expect(access.apps).toHaveLength(1);
    expect(access.apps[0]).toMatchObject({ app: "Claude" });
    expect(access.members).toHaveLength(2);
  });

  it("asks the partner once when someone allows it, and names apps it recognises by their return address", async () => {
    const { dom, sub, relId, subId } = await ctx.pair();
    const before = ctx.notifier.sent.length;
    await dom.put(`/relationships/${relId}/ai-access`, { allowed: true });
    await dom.put(`/relationships/${relId}/ai-access`, { allowed: true });
    const asks = ctx.notifier.sent.slice(before).filter((s) => s.push.data?.type === "ai_access_asked");
    expect(asks).toHaveLength(1);
    expect(asks[0]).toMatchObject({ userIds: [subId], push: { body: "Dom wants to use Fealty with an AI app." } });
    expect((await sub.get("/me")).body.relationships[0].members.find((m: { userId: string }) => m.userId !== subId).aiAccess).toBe(true);

    await connect(ctx, dom);
    const apps = (await sub.get(`/relationships/${relId}/ai-access`)).body.apps;
    expect(apps[0]).toMatchObject({ app: "Claude", kind: "claude" });
    // A look-alike name with someone else's return address gets no mark.
    expect(knownApp(["https://evil.example/cb"])).toBeNull();
    expect(knownApp(["https://claude.ai/api/mcp/auth_callback", "https://evil.example/cb"])).toBeNull();
    expect(knownApp(["https://chatgpt.com/connector_platform_oauth_redirect"])?.kind).toBe("chatgpt");
  });

  it("tells the partner when an app is connected", async () => {
    const { dom, subId } = await ctx.pair();
    const before = ctx.notifier.sent.length;
    await connect(ctx, dom);
    const told = ctx.notifier.sent.slice(before).find((s) => s.push.data?.type === "ai_connected");
    expect(told?.userIds).toEqual([subId]);
    expect(told?.push.body).toBe("Dom connected Claude.");
  });

  it("lets a solo member allow it alone", async () => {
    const solo = ctx.as(randomUUID(), "Kitten");
    const rel = (await solo.post("/relationships", { role: "submissive" })).body;
    const { access_token } = await connect(ctx, solo);
    await solo.put(`/relationships/${rel.id}/ai-access`, { allowed: true });
    expect((await tool(ctx, access_token, "list_dynamics")).data.dynamics[0]).toMatchObject({ id: rel.id, solo: true, yourRole: "switch" });
  });

  it("keeps the app's own permission checks: a dynamic that doesn't allow AI access looks like one you're not in", async () => {
    const { dom, sub, relId, domId } = await ctx.pair();
    await dom.put(`/relationships/${relId}/ai-access`, { allowed: true });
    const asAi = () => requestScope.run({ write: false, ai: true }, () => requireMember(ctx.db, relId, domId));
    await expect(asAi()).rejects.toMatchObject({ status: 404 });
    await sub.put(`/relationships/${relId}/ai-access`, { allowed: true });
    await expect(asAi()).resolves.toMatchObject({ role: "dominant" });
  });

  it("doesn't let an AI token stand in for a sign-in on the app's own routes", async () => {
    const { dom, relId } = await ctx.pair();
    const { access_token } = await connect(ctx, dom);
    const res = await ctx.app.inject({ method: "GET", url: `/relationships/${relId}/notes`, headers: { authorization: `Bearer ${access_token}` } });
    expect(res.statusCode).toBe(401);
    // Nor can someone outside guess their way into the in-process path.
    const forged = await ctx.app.inject({ method: "GET", url: "/me", headers: { "x-fealty-ai-internal": "guess", "x-ai-grant": randomUUID() } });
    expect(forged.statusCode).toBe(401);
  });

  it("swaps a code once, checks PKCE, rotates refresh tokens and stops on disconnect", async () => {
    const { dom } = await ctx.pair();
    const t = await connect(ctx, dom);
    const form = (body: Record<string, string>) =>
      ctx.app.inject({ method: "POST", url: "/oauth/token", headers: { "content-type": "application/x-www-form-urlencoded" }, payload: new URLSearchParams(body).toString() });

    // A used code is gone.
    expect((await form({ grant_type: "authorization_code", code: t.code, redirect_uri: REDIRECT, client_id: t.clientId, code_verifier: t.verifier })).statusCode).toBe(400);

    const refreshed = await form({ grant_type: "refresh_token", refresh_token: t.refresh_token, client_id: t.clientId });
    expect(refreshed.statusCode).toBe(200);
    const next = refreshed.json() as { access_token: string; refresh_token: string };
    // The old pair stops working.
    expect((await form({ grant_type: "refresh_token", refresh_token: t.refresh_token, client_id: t.clientId })).statusCode).toBe(400);
    expect((await mcp(ctx, t.access_token, "tools/list")).status).toBe(401);
    expect((await mcp(ctx, next.access_token, "tools/list")).status).toBe(200);

    const [grant] = (await dom.get("/me/ai-apps")).body as { id: string }[];
    expect((await dom.del(`/me/ai-apps/${grant!.id}`)).status).toBe(204);
    expect((await mcp(ctx, next.access_token, "tools/list")).status).toBe(401);
  });

  it("refuses a wrong PKCE verifier and an unregistered return address", async () => {
    const { dom } = await ctx.pair();
    const reg = (await ctx.app.inject({ method: "POST", url: "/oauth/register", payload: { redirect_uris: [REDIRECT] } })).json();
    const challenge = createHash("sha256").update("a".repeat(43)).digest("base64url");
    const params = { response_type: "code", client_id: reg.client_id, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: "S256" };
    const code = new URL((await dom.post("/oauth/approve", { ...params, allow: true })).body.redirect).searchParams.get("code")!;
    const res = await ctx.app.inject({
      method: "POST",
      url: "/oauth/token",
      payload: { grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id: reg.client_id, code_verifier: "b".repeat(43) },
    });
    expect(res.json()).toEqual({ error: "invalid_grant" });

    const elsewhere = await ctx.app.inject({ method: "GET", url: `/oauth/authorize?${new URLSearchParams({ ...params, redirect_uri: "https://evil.example/cb" })}` });
    expect(elsewhere.statusCode).toBe(400);
    expect(elsewhere.headers.location).toBeUndefined();
  });

  it("gives staff tools only to a verified address on the admin list", async () => {
    const someone = ctx.as(randomUUID(), "Someone");
    expect((await connect(ctx, someone, "fealty fealty:staff")).scope).toBe("fealty");
    const mod = ctx.as(randomUUID(), "Mod");
    (mod.headers as Record<string, string>)["x-dev-email"] = "mod@example.com";
    expect((await connect(ctx, mod, "fealty fealty:staff")).scope).toBe("fealty fealty:staff");
  });

  it("only turns AI access on for a member of a live dynamic, but always lets you turn it off", async () => {
    const { dom, sub, relId } = await ctx.pair();
    const stranger = ctx.as(randomUUID(), "Stranger");
    expect((await stranger.put(`/relationships/${relId}/ai-access`, { allowed: true })).status).toBe(404);
    await dom.put(`/relationships/${relId}/ai-access`, { allowed: true });
    await sub.post(`/relationships/${relId}/leave`);
    expect((await dom.put(`/relationships/${relId}/ai-access`, { allowed: true })).status).toBe(409);
    expect((await dom.put(`/relationships/${relId}/ai-access`, { allowed: false })).status).toBe(200);
  });
});
