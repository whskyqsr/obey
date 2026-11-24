import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Deps } from "../app.js";
import { aiCalls, aiGrants } from "../db/schema.js";
import { aiReachable, grantForAccessToken } from "../services/aiAccess.js";
import { publicApiUrl } from "../routes/oauth.js";
import { type Call, USER_ROUTES, failed, registerUserTools, text } from "./tools.js";
import { WRITE_ROUTES, registerWriteTools } from "./writeTools.js";
import { STAFF_ROUTES, registerStaffTools } from "./staffTools.js";
import { SCOPE_STAFF } from "../services/aiAccess.js";

export const AI_INTERNAL_HEADER = "x-fealty-ai-internal";

/**
 * The app routes MCP tools may call, by method and route pattern. Anything not listed (photos, the keybox, location,
 * safe calls, settings, AI access itself) can't be reached by an AI app even by mistake.
 */
const AI_ROUTES = new Set<string>([...USER_ROUTES, ...WRITE_ROUTES, ...STAFF_ROUTES]);

export const aiRouteAllowed = (method: string, routeUrl: string | undefined) => routeUrl !== undefined && AI_ROUTES.has(`${method} ${routeUrl}`);

type Grant = typeof aiGrants.$inferSelect;

interface MeBody {
  user: { id: string; displayName: string };
  relationships: {
    id: string;
    name: string | null;
    features: Record<string, boolean>;
    endedAt: string | null;
    members: { userId: string; displayName: string; role: string }[];
  }[];
}

function buildServer(deps: Deps, grant: Grant, call: Call, touched: Set<string>) {
  const server = new McpServer(
    { name: "fealty", version: "1.0.0" },
    {
      instructions:
        "Fealty is a D/s app for partners. You act as the person who connected you and can see and do only what they can in the app. " +
        'Write "submissive" in lowercase, always. Call people by their first names. Start with list_dynamics.',
    },
  );

  /** Runs a tool and logs the call, without its content. */
  const logged =
    <A extends object>(tool: string, run: (args: A) => Promise<CallToolResult>) =>
    async (args: A): Promise<CallToolResult> => {
      let result: CallToolResult;
      touched.clear();
      try {
        result = await run(args);
      } catch {
        result = failed("Something went wrong in Fealty. Try again in a moment.");
      }
      // One row per dynamic the call really reached (not the one it named), or one with none.
      const base = { grantId: grant.id, userId: grant.userId, tool, ok: !result.isError, createdAt: deps.now() };
      const rows = touched.size ? [...touched].map((relationshipId) => ({ ...base, relationshipId })) : [{ ...base, relationshipId: null }];
      await deps.db.insert(aiCalls).values(rows);
      return result;
    };

  server.registerTool(
    "list_dynamics",
    {
      title: "List dynamics",
      description: "The dynamics you can reach here: their ids, your role, your partners and which parts of the app are switched on.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    logged("list_dynamics", async () => {
      const me = await call("GET", "/me");
      if (me.status !== 200) return failed("Couldn't load your dynamics.");
      const body = me.body as MeBody;
      const out = [];
      for (const r of body.relationships) {
        if (!(await aiReachable(deps.db, r.id))) continue;
        const mine = r.members.find((m) => m.userId === body.user.id);
        const solo = r.members.length === 1 && !r.endedAt;
        out.push({
          id: r.id,
          name: r.name,
          yourRole: solo ? "switch" : mine?.role,
          solo,
          ended: r.endedAt !== null,
          partners: r.members.filter((m) => m.userId !== body.user.id).map((m) => ({ id: m.userId, name: m.displayName, role: m.role })),
          switchedOn: Object.entries(r.features)
            .filter(([, on]) => on)
            .map(([f]) => f),
        });
      }
      if (!out.length) return text({ dynamics: [], note: "None of your dynamics allow AI access yet. Every partner switches it on in Fealty, under Your dynamic." });
      return text({ you: { id: body.user.id, name: body.user.displayName }, dynamics: out });
    }),
  );

  registerUserTools(server, call, logged);
  registerWriteTools(server, call, logged);
  // Listed only on a staff connection; the admin routes check the address list again on every call.
  if (grant.scope.split(" ").includes(SCOPE_STAFF)) registerStaffTools(server, call, logged, (deps.appUrl ?? "https://app.fealty.me").replace(/\/$/, ""));
  return server;
}

/** The MCP endpoint (Streamable HTTP, stateless). Each request carries an OAuth access token from /oauth/token. */
export const mcpRoutes = (deps: Deps, opts: { internalSecret: string }) => async (app: FastifyInstance) => {
  const unauthorized = (req: FastifyRequest, reply: FastifyReply) =>
    reply
      .status(401)
      .header("www-authenticate", `Bearer resource_metadata="${publicApiUrl(deps, req)}/.well-known/oauth-protected-resource/mcp"`)
      .send({ error: "invalid_token" });

  const handler = async (req: FastifyRequest, reply: FastifyReply) => {
    const header = req.headers.authorization;
    const grant = header?.startsWith("Bearer ") ? await grantForAccessToken(deps.db, header.slice(7), deps.now()) : null;
    if (!grant) return unauthorized(req, reply);
    const now = deps.now();
    if (!grant.lastUsedAt || now.getTime() - grant.lastUsedAt.getTime() > 60_000) await deps.db.update(aiGrants).set({ lastUsedAt: now }).where(eq(aiGrants.id, grant.id));

    const touched = new Set<string>();
    const call: Call = async (method, url, payload) => {
      const res = await app.inject({
        method,
        url,
        payload: payload as object | undefined,
        headers: { [AI_INTERNAL_HEADER]: opts.internalSecret, "x-ai-grant": grant.id },
      });
      const reached = res.headers["x-ai-touched"];
      if (typeof reached === "string") for (const id of reached.split(",")) touched.add(id);
      return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : undefined };
    };

    const server = buildServer(deps, grant, call, touched);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
    const request = new Request(`${publicApiUrl(deps, req)}/mcp`, {
      method: req.method,
      headers,
      body: req.method === "POST" ? JSON.stringify(req.body ?? null) : undefined,
    });
    try {
      const res = await transport.handleRequest(request, { parsedBody: req.method === "POST" ? req.body : undefined });
      reply.status(res.status);
      res.headers.forEach((v, k) => void reply.header(k, v));
      return reply.send(await res.text());
    } finally {
      await server.close();
    }
  };

  app.post("/mcp", { config: { ownAuth: true } }, handler);
  app.get("/mcp", { config: { ownAuth: true } }, handler);
  app.delete("/mcp", { config: { ownAuth: true } }, handler);
};
