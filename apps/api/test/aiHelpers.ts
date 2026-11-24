import { createHash, randomBytes } from "node:crypto";
import { expect } from "vitest";
import type { setup } from "./helpers.js";

type Ctx = Awaited<ReturnType<typeof setup>>;
type Person = ReturnType<Ctx["as"]>;

export const REDIRECT = "https://claude.ai/api/mcp/auth_callback";

/** Connects an AI app the way Claude would: register, approve on the connect page, swap the code for tokens. */
export async function connect(ctx: Ctx, person: Person, scope = "fealty") {
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
export async function mcp(ctx: Ctx, token: string, method: string, params: unknown = {}) {
  const res = await ctx.app.inject({
    method: "POST",
    url: "/mcp",
    headers: { authorization: `Bearer ${token}`, accept: "application/json, text/event-stream", "content-type": "application/json", "mcp-protocol-version": "2025-06-18" },
    payload: { jsonrpc: "2.0", id: ++rpcId, method, params },
  });
  return { status: res.statusCode, headers: res.headers, body: res.body ? JSON.parse(res.body) : undefined };
}

export async function tool(ctx: Ctx, token: string, name: string, args: Record<string, unknown> = {}) {
  const res = await mcp(ctx, token, "tools/call", { name, arguments: args });
  expect(res.status).toBe(200);
  const result = res.body.result as { content: { text: string }[]; isError?: boolean };
  return { ...result, data: result.isError ? undefined : JSON.parse(result.content[0]!.text) };
}

