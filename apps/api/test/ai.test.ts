import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requestScope, requireMember } from "../src/services/access.js";
import { setup } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  ctx = await setup();
});
afterAll(async () => ctx.close());

const REDIRECT = "https://claude.ai/api/mcp/auth_callback";

/** Connects an AI app the way Claude would: register, approve on the connect page, swap the code for tokens. */
async function connect(person: ReturnType<typeof ctx.as>, scope = "fealty") {
  const reg = await ctx.app.inject({ method: "POST", url: "/oauth/register", payload: { redirect_uris: [REDIRECT], client_name: "Claude" } });
  expect(reg.statusCode).toBe(201);
  const clientId = reg.json().client_id as string;
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const params = { response_type: "code", client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: "S256", state: "xyz", scope };

  const authorize = await ctx.app.inject({ method: "GET", url: `/oauth/authorize?${new URLSearchParams(params)}` });
  expect(authorize.statusCode).toBe(302);
  expect(authorize.headers.location).toContain("/connect?");

  const approved = await person.post("/oauth/approve", { ...params, allow: true });
  expect(approved.status).toBe(200);
  const back = new URL(approved.body.redirect);
  expect(back.searchParams.get("state")).toBe("xyz");
  const code = back.searchParams.get("code")!;

  const token = await ctx.app.inject({
    method: "POST",
    url: "/oauth/token",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    payload: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id: clientId, code_verifier: verifier }).toString(),
  });
  expect(token.statusCode).toBe(200);
  const t = token.json() as { access_token: string; refresh_token: string; scope: string };
  return { clientId, verifier, code, ...t };
}

let rpcId = 0;
async function mcp(token: string, method: string, params: unknown = {}) {
  const res = await ctx.app.inject({
    method: "POST",
    url: "/mcp",
    headers: { authorization: `Bearer ${token}`, accept: "application/json, text/event-stream", "content-type": "application/json", "mcp-protocol-version": "2025-06-18" },
    payload: { jsonrpc: "2.0", id: ++rpcId, method, params },
  });
  return { status: res.statusCode, headers: res.headers, body: res.body ? JSON.parse(res.body) : undefined };
}

async function tool(token: string, name: string, args: Record<string, unknown> = {}) {
  const res = await mcp(token, "tools/call", { name, arguments: args });
  expect(res.status).toBe(200);
  const result = res.body.result as { content: { text: string }[]; isError?: boolean };
  return { ...result, data: result.isError ? undefined : JSON.parse(result.content[0]!.text) };
}

describe("AI access over MCP", () => {
  it("advertises OAuth and asks for a token", async () => {
    const meta = await ctx.app.inject({ method: "GET", url: "/.well-known/oauth-authorization-server" });
    expect(meta.json()).toMatchObject({ code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none"] });
    expect((await ctx.app.inject({ method: "GET", url: "/.well-known/oauth-protected-resource/mcp" })).json().resource).toMatch(/\/mcp$/);
    const res = await mcp("nope", "tools/list");
    expect(res.status).toBe(401);
    expect(res.headers["www-authenticate"]).toContain("resource_metadata=");
  });

  it("only reaches a dynamic once every partner allows it, and either can cut it off", async () => {
    const { dom, sub, relId } = await ctx.pair();
    const { access_token } = await connect(dom);

    const tools = await mcp(access_token, "tools/list");
    expect(tools.body.result.tools.map((t: { name: string }) => t.name)).toContain("list_dynamics");

    expect((await tool(access_token, "list_dynamics")).data.dynamics).toEqual([]);
    await dom.put(`/relationships/${relId}/ai-access`, { allowed: true });
    // The Dominant alone can't open the submissive's side of things.
    expect((await tool(access_token, "list_dynamics")).data.dynamics).toEqual([]);
    expect((await sub.put(`/relationships/${relId}/ai-access`, { allowed: true })).body).toEqual({ allowed: true, reachable: true });

    const listed = (await tool(access_token, "list_dynamics")).data;
    expect(listed.dynamics).toHaveLength(1);
    expect(listed.dynamics[0]).toMatchObject({ id: relId, yourRole: "dominant", partners: [{ name: "Sub", role: "submissive" }] });

    // The submissive changes their mind: the Dominant's app loses the dynamic at once.
    await sub.put(`/relationships/${relId}/ai-access`, { allowed: false });
    expect((await tool(access_token, "list_dynamics")).data.dynamics).toEqual([]);

    // Both partners see the app and the calls it made, without their content.
    const access = (await sub.get(`/relationships/${relId}/ai-access`)).body;
    expect(access.apps).toHaveLength(1);
    expect(access.apps[0]).toMatchObject({ app: "Claude" });
    expect(access.members).toHaveLength(2);
  });

  it("tells the partner when an app is connected", async () => {
    const { dom, subId } = await ctx.pair();
    const before = ctx.notifier.sent.length;
    await connect(dom);
    const told = ctx.notifier.sent.slice(before).find((s) => s.push.data?.type === "ai_connected");
    expect(told?.userIds).toEqual([subId]);
    expect(told?.push.body).toBe("Dom connected Claude.");
  });

  it("lets a solo member allow it alone", async () => {
    const solo = ctx.as(randomUUID(), "Kitten");
    const rel = (await solo.post("/relationships", { role: "submissive" })).body;
    const { access_token } = await connect(solo);
    await solo.put(`/relationships/${rel.id}/ai-access`, { allowed: true });
    expect((await tool(access_token, "list_dynamics")).data.dynamics[0]).toMatchObject({ id: rel.id, solo: true, yourRole: "switch" });
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
    const { access_token } = await connect(dom);
    const res = await ctx.app.inject({ method: "GET", url: `/relationships/${relId}/notes`, headers: { authorization: `Bearer ${access_token}` } });
    expect(res.statusCode).toBe(401);
    // Nor can someone outside guess their way into the in-process path.
    const forged = await ctx.app.inject({ method: "GET", url: "/me", headers: { "x-fealty-ai-internal": "guess", "x-ai-grant": randomUUID() } });
    expect(forged.statusCode).toBe(401);
  });

  it("swaps a code once, checks PKCE, rotates refresh tokens and stops on disconnect", async () => {
    const { dom } = await ctx.pair();
    const t = await connect(dom);
    const form = (body: Record<string, string>) =>
      ctx.app.inject({ method: "POST", url: "/oauth/token", headers: { "content-type": "application/x-www-form-urlencoded" }, payload: new URLSearchParams(body).toString() });

    // A used code is gone.
    expect((await form({ grant_type: "authorization_code", code: t.code, redirect_uri: REDIRECT, client_id: t.clientId, code_verifier: t.verifier })).statusCode).toBe(400);

    const refreshed = await form({ grant_type: "refresh_token", refresh_token: t.refresh_token, client_id: t.clientId });
    expect(refreshed.statusCode).toBe(200);
    const next = refreshed.json() as { access_token: string; refresh_token: string };
    // The old pair stops working.
    expect((await form({ grant_type: "refresh_token", refresh_token: t.refresh_token, client_id: t.clientId })).statusCode).toBe(400);
    expect((await mcp(t.access_token, "tools/list")).status).toBe(401);
    expect((await mcp(next.access_token, "tools/list")).status).toBe(200);

    const [grant] = (await dom.get("/me/ai-apps")).body as { id: string }[];
    expect((await dom.del(`/me/ai-apps/${grant!.id}`)).status).toBe(204);
    expect((await mcp(next.access_token, "tools/list")).status).toBe(401);
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
    expect((await connect(someone, "fealty fealty:staff")).scope).toBe("fealty");
    const mod = ctx.as(randomUUID(), "Mod");
    (mod.headers as Record<string, string>)["x-dev-email"] = "mod@example.com";
    expect((await connect(mod, "fealty fealty:staff")).scope).toBe("fealty fealty:staff");
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
