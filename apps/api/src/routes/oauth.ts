import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull, ne } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Deps } from "../app.js";
import { aiGrants, memberships, oauthClients, oauthCodes, relationships, users } from "../db/schema.js";
import { HttpError } from "../errors.js";
import {
  ACCESS_TTL_MS,
  CODE_TTL_MS,
  REFRESH_TTL_MS,
  SCOPE_STAFF,
  SCOPE_USER,
  hashToken,
  newToken,
  pkceMatches,
  rotateTokens,
} from "../services/aiAccess.js";

/** This API's public address, for OAuth metadata and the MCP resource id. */
export function publicApiUrl(deps: Deps, req: FastifyRequest) {
  if (deps.apiUrl) return deps.apiUrl.replace(/\/$/, "");
  const proto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0] ?? req.protocol;
  return `${proto}://${req.headers.host}`;
}

/** https anywhere, or http only back to this machine (desktop MCP clients). */
const redirectUri = z.string().refine((s) => {
  try {
    const u = new URL(s);
    if (u.hash) return false;
    return u.protocol === "https:" || (u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname));
  } catch {
    return false;
  }
}, "redirect URIs must be https, or http to localhost");

const register = z.object({
  redirect_uris: z.array(redirectUri).min(1).max(10),
  client_name: z.string().trim().min(1).max(80).optional(),
  token_endpoint_auth_method: z.string().optional(),
});

const authorizeParams = z.object({
  response_type: z.literal("code"),
  client_id: z.string().min(1).max(100),
  redirect_uri: z.string().min(1).max(2000),
  code_challenge: z.string().min(43).max(128),
  code_challenge_method: z.literal("S256"),
  state: z.string().max(2000).optional(),
  scope: z.string().max(200).optional(),
  resource: z.string().max(2000).optional(),
});

const approve = authorizeParams.extend({ allow: z.boolean() });

/** The scopes a person gets: always the user scope, and staff only for a verified address on ADMIN_EMAILS. */
const grantedScope = (asked: string | undefined, admin: boolean) => (admin && asked?.split(" ").includes(SCOPE_STAFF) ? `${SCOPE_USER} ${SCOPE_STAFF}` : SCOPE_USER);

const tokenRequest = z.discriminatedUnion("grant_type", [
  z.object({ grant_type: z.literal("authorization_code"), code: z.string().min(1), redirect_uri: z.string().min(1), client_id: z.string().min(1), code_verifier: z.string().min(43).max(128) }),
  z.object({ grant_type: z.literal("refresh_token"), refresh_token: z.string().min(1), client_id: z.string().min(1) }),
]);

const oauthError = (reply: FastifyReply, error: string, description?: string, status = 400) =>
  reply.status(status).header("cache-control", "no-store").send({ error, ...(description ? { error_description: description } : {}) });

/**
 * OAuth 2.1 for AI apps connecting over MCP: discovery documents, dynamic client registration, the authorize step
 * (which hands over to the web app's connect page, where the person signs in as usual and approves), and tokens.
 */
export const oauthRoutes = (deps: Deps) => async (app: FastifyInstance) => {
  const { db } = deps;
  const own = { config: { ownAuth: true } };

  const resourceMetadata = async (req: FastifyRequest) => {
    const base = publicApiUrl(deps, req);
    return { resource: `${base}/mcp`, authorization_servers: [base], scopes_supported: [SCOPE_USER, SCOPE_STAFF], bearer_methods_supported: ["header"], resource_name: "Fealty" };
  };
  app.get("/.well-known/oauth-protected-resource", own, resourceMetadata);
  app.get("/.well-known/oauth-protected-resource/mcp", own, resourceMetadata);

  app.get("/.well-known/oauth-authorization-server", own, async (req) => {
    const base = publicApiUrl(deps, req);
    return {
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/oauth/token`,
      registration_endpoint: `${base}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: [SCOPE_USER, SCOPE_STAFF],
    };
  });

  app.post("/oauth/register", { config: { ownAuth: true, rateLimit: { max: 20, timeWindow: "1 hour" } } }, async (req, reply) => {
    const parsed = register.safeParse(req.body ?? {});
    if (!parsed.success) return oauthError(reply, "invalid_client_metadata", parsed.error.issues[0]?.message);
    const id = `fc_${randomBytes(16).toString("base64url")}`;
    const name = parsed.data.client_name ?? "An AI app";
    await db.insert(oauthClients).values({ id, name, redirectUris: parsed.data.redirect_uris, createdAt: deps.now() });
    return reply.status(201).send({
      client_id: id,
      client_name: name,
      redirect_uris: parsed.data.redirect_uris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    });
  });

  const clientFor = async (clientId: string, uri: string) => {
    const [client] = await db.select().from(oauthClients).where(eq(oauthClients.id, clientId));
    return client && client.redirectUris.includes(uri) ? client : null;
  };

  // A bad client or redirect is shown, never redirected to; anything else goes on to the connect page.
  app.get("/oauth/authorize", { config: { ownAuth: true, rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const q = req.query as Record<string, string>;
    const client = q.client_id && q.redirect_uri ? await clientFor(q.client_id, q.redirect_uri) : null;
    if (!client) return reply.status(400).type("text/plain").send("This app isn't registered with Fealty, or its return address doesn't match.");
    const parsed = authorizeParams.safeParse(q);
    if (!parsed.success) {
      const back = new URL(q.redirect_uri!);
      back.searchParams.set("error", "invalid_request");
      if (q.state) back.searchParams.set("state", q.state);
      return reply.redirect(back.toString());
    }
    const appUrl = (deps.appUrl ?? "http://localhost:5173").replace(/\/$/, "");
    return reply.redirect(`${appUrl}/connect?${new URLSearchParams(parsed.data as Record<string, string>).toString()}`);
  });

  /** What the connect page shows: the app's name, and whether staff tools come with it. */
  app.get("/oauth/connect-info", async (req) => {
    const q = req.query as Record<string, string>;
    const client = q.client_id && q.redirect_uri ? await clientFor(q.client_id, q.redirect_uri) : null;
    if (!client) throw new HttpError(400, "this app isn't registered with Fealty");
    return { clientName: client.name, staff: grantedScope(q.scope, req.admin).includes(SCOPE_STAFF) };
  });

  /** The person, signed in on the connect page, allows or refuses the app. Returns where to send the browser. */
  app.post("/oauth/approve", async (req) => {
    const body = approve.parse(req.body);
    const client = await clientFor(body.client_id, body.redirect_uri);
    if (!client) throw new HttpError(400, "this app isn't registered with Fealty");
    const back = new URL(body.redirect_uri);
    if (body.state) back.searchParams.set("state", body.state);
    if (!body.allow) {
      back.searchParams.set("error", "access_denied");
      return { redirect: back.toString() };
    }
    const code = newToken("fea_code");
    await db.insert(oauthCodes).values({
      codeHash: hashToken(code),
      clientId: client.id,
      userId: req.user.id,
      redirectUri: body.redirect_uri,
      codeChallenge: body.code_challenge,
      scope: grantedScope(body.scope, req.admin),
      expiresAt: new Date(deps.now().getTime() + CODE_TTL_MS),
    });
    back.searchParams.set("code", code);
    return { redirect: back.toString() };
  });

  app.post("/oauth/token", { config: { ownAuth: true, rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const parsed = tokenRequest.safeParse(req.body ?? {});
    if (!parsed.success) return oauthError(reply, "invalid_request");
    const body = parsed.data;
    const now = deps.now();

    if (body.grant_type === "authorization_code") {
      // A code works once: it's gone as soon as anyone tries it.
      const [code] = await db.delete(oauthCodes).where(eq(oauthCodes.codeHash, hashToken(body.code))).returning();
      if (!code || code.expiresAt <= now || code.clientId !== body.client_id || code.redirectUri !== body.redirect_uri || !pkceMatches(body.code_verifier, code.codeChallenge))
        return oauthError(reply, "invalid_grant");
      const access = newToken("fea_at");
      const refresh = newToken("fea_rt");
      const [grant] = await db
        .insert(aiGrants)
        .values({
          clientId: code.clientId,
          userId: code.userId,
          scope: code.scope,
          accessHash: hashToken(access),
          accessExpiresAt: new Date(now.getTime() + ACCESS_TTL_MS),
          refreshHash: hashToken(refresh),
          refreshExpiresAt: new Date(now.getTime() + REFRESH_TTL_MS),
          createdAt: now,
        })
        .returning();
      await tellPartners(code.userId, code.clientId);
      return reply.header("cache-control", "no-store").send({ access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_MS / 1000, refresh_token: refresh, scope: grant!.scope });
    }

    const [grant] = await db
      .select()
      .from(aiGrants)
      .where(and(eq(aiGrants.refreshHash, hashToken(body.refresh_token)), gt(aiGrants.refreshExpiresAt, now), isNull(aiGrants.revokedAt)));
    if (!grant || grant.clientId !== body.client_id) return oauthError(reply, "invalid_grant");
    const tokens = await rotateTokens(db, grant.id, now);
    return reply.header("cache-control", "no-store").send({ access_token: tokens.access, token_type: "Bearer", expires_in: ACCESS_TTL_MS / 1000, refresh_token: tokens.refresh, scope: grant.scope });
  });

  /** Partners in every live dynamic hear that an AI app was connected, whatever their notification settings. */
  async function tellPartners(userId: string, clientId: string) {
    const [client] = await db.select({ name: oauthClients.name }).from(oauthClients).where(eq(oauthClients.id, clientId));
    const [person] = await db.select({ name: users.displayName }).from(users).where(eq(users.id, userId));
    const mine = await db
      .select({ relationshipId: memberships.relationshipId })
      .from(memberships)
      .innerJoin(relationships, eq(relationships.id, memberships.relationshipId))
      .where(and(eq(memberships.userId, userId), isNull(relationships.endedAt)));
    for (const { relationshipId } of mine) {
      const others = (await db.select({ id: memberships.userId }).from(memberships).where(and(eq(memberships.relationshipId, relationshipId), ne(memberships.userId, userId)))).map((m) => m.id);
      if (!others.length) continue;
      await deps.notifier.send(others, { title: "Fealty", body: `${person?.name ?? "Your partner"} connected ${client?.name ?? "an AI app"}.`, data: { type: "ai_connected", relationshipId } });
    }
  }
};
