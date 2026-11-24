import { randomBytes } from "node:crypto";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { ZodError, type ZodType } from "zod";
import { type Authenticator, upsertUser } from "./auth.js";
import type { Db } from "./db/index.js";
import type { users } from "./db/schema.js";
import { HttpError } from "./errors.js";
import type { Notifier } from "./notify.js";
import { requestScope } from "./services/access.js";
import { AI_INTERNAL_HEADER, aiRouteAllowed, mcpRoutes } from "./mcp/server.js";
import { oauthRoutes } from "./routes/oauth.js";
import { aiAccessRoutes } from "./routes/aiAccess.js";
import { aiGrants, users as usersTable } from "./db/schema.js";
import { eq, getTableColumns } from "drizzle-orm";
import { SCOPE_STAFF } from "./services/aiAccess.js";
import { adminRoutes } from "./routes/admin.js";
import { commentRoutes } from "./routes/comments.js";
import { limitRoutes } from "./routes/limits.js";
import { limitListRoutes } from "./routes/limitList.js";
import { locationRoutes } from "./routes/location.js";
import { curfewRoutes } from "./routes/curfew.js";
import { ruleLogRoutes } from "./routes/ruleLog.js";
import { safeCallRoutes } from "./routes/safeCalls.js";
import { agreementRoutes } from "./routes/agreement.js";
import { sceneRoutes } from "./routes/scenes.js";
import { kitRoutes } from "./routes/kits.js";
import { chastityRoutes } from "./routes/chastity.js";
import { roleSwapRoutes } from "./routes/roleSwaps.js";
import { verificationRoutes } from "./routes/verification.js";
import { eventRoutes } from "./routes/events.js";
import { libraryRoutes } from "./routes/library.js";
import { pointsRoutes } from "./routes/points.js";
import { proofRoutes } from "./routes/proofs.js";
import { relationshipRoutes } from "./routes/relationships.js";
import { statsRoutes } from "./routes/stats.js";
import { monthRoutes } from "./routes/months.js";
import { taskRoutes } from "./routes/tasks.js";
import type { Geocoder } from "./services/geocode.js";
import { type FetchCredit, type FetchTile, imageryRoutes } from "./routes/imagery.js";

export interface Deps {
  db: Db;
  authenticate: Authenticator;
  notifier: Notifier;
  now: () => Date;
  materializeDays: number;
  corsOrigins?: string[];
  /** People who review reports, by verified email (ADMIN_EMAILS). */
  adminEmails?: string[];
  /** Sends our own verification email; null means clients fall back to Firebase's. */
  sendVerification?: ((email: string) => Promise<void>) | null;
  /** Removes a sign-in from Firebase by its uid; null when the API has no service account. */
  deleteSignIn?: ((authUid: string) => Promise<void>) | null;
  /** Address search for places; defaults to Photon. Tests pass a stub. */
  geocode?: Geocoder;
  /** Satellite tiles for the place picker (Esri), when there's a key. Tests pass a stub fetch. */
  imagery?: { key: string; fetchTile?: FetchTile; fetchCredit?: FetchCredit } | null;
  /** The web app, where the connect page for AI apps lives (APP_URL). */
  appUrl?: string;
  /** This API's public address (API_URL); worked out from each request when unset. */
  apiUrl?: string;
  /** Per-address request limits (requests per minute, overall); the server turns them on, tests mostly leave them off. */
  rateLimit?: { max: number } | null;
  logger?: boolean;
}

/** The caller, without the avatar bytes (those are only read by the avatar route). */
export type User = Omit<typeof users.$inferSelect, "avatar">;

declare module "fastify" {
  interface FastifyRequest {
    user: User;
    /** Signed in with a verified email listed in ADMIN_EMAILS. */
    admin: boolean;
    /** The sign-in email, verified or not. */
    email: string | null;
  }
  interface FastifyContextConfig {
    /** Lets an email-and-password account that hasn't confirmed its address call this route. */
    allowUnverified?: boolean;
    /** Checks its own signed link instead of the sign-in header (map tiles, which can't send one). */
    signedLink?: boolean;
    /** Checks its own credentials or none (OAuth and MCP endpoints), instead of the sign-in header. */
    ownAuth?: boolean;
  }
}

export function parse<T>(schema: ZodType<T>, value: unknown): T {
  return schema.parse(value);
}

export function buildApp(deps: Deps) {
  const app = Fastify({ logger: deps.logger ?? false });
  // @fastify/cors only allows GET, HEAD and POST unless told otherwise.
  app.register(cors, { origin: deps.corsOrigins ?? true, credentials: true, methods: ["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE"] });

  app.decorateRequest("user", null as unknown as User);
  app.decorateRequest("admin", false);
  app.decorateRequest("email", null);
  // MCP tools call the app's own routes in-process, as the person who connected the AI app. This secret marks those
  // calls; it never leaves the process, so nothing from outside can pass for one.
  const internalSecret = randomBytes(32).toString("base64url");
  const aiGrantOf = (req: FastifyRequest) => (req.headers[AI_INTERNAL_HEADER] === internalSecret ? (req.headers["x-ai-grant"] as string | undefined) : undefined);
  if (deps.rateLimit) {
    // Counted per caller address. Railway's edge sets X-Real-IP to the caller's address; locally there's none.
    // MCP tools' in-process calls are already counted once, at /mcp. Routes can set their own limit in config.rateLimit.
    app.register(rateLimit, {
      max: deps.rateLimit.max,
      timeWindow: "1 minute",
      keyGenerator: (req) => (typeof req.headers["x-real-ip"] === "string" ? req.headers["x-real-ip"] : req.ip),
      allowList: (req) => req.headers[AI_INTERNAL_HEADER] === internalSecret || req.url === "/health",
    });
  }
  // OAuth's token endpoint takes form posts.
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_req, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(body as string)));
  });
  const admins = new Set((deps.adminEmails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean));
  // Callback style so the rest of the request runs inside the scope.
  app.addHook("onRequest", (req, _reply, done) => {
    const write = !["GET", "HEAD", "OPTIONS"].includes(req.method);
    requestScope.run(aiGrantOf(req) !== undefined ? { write, ai: true, touched: new Set<string>() } : { write }, done);
  });
  // An AI call reports back which dynamics it touched, so the MCP layer logs the right one.
  app.addHook("onSend", async (_req, reply) => {
    const touched = requestScope.getStore()?.touched;
    if (touched?.size) reply.header("x-ai-touched", [...touched].join(","));
  });
  app.addHook("onRequest", async (req: FastifyRequest) => {
    if (req.method === "OPTIONS" || req.url === "/health" || req.routeOptions.config.signedLink || req.routeOptions.config.ownAuth) return;
    const grantId = aiGrantOf(req);
    if (grantId !== undefined) {
      // Only the routes MCP tools use; everything else (photos, location, settings, AI access itself) stays app-only.
      if (!aiRouteAllowed(req.method, req.routeOptions.url)) throw new HttpError(404, "not found");
      const { avatar: _a, ...cols } = getTableColumns(usersTable);
      const [row] = await deps.db
        .select({ user: cols, scope: aiGrants.scope })
        .from(aiGrants)
        .innerJoin(usersTable, eq(usersTable.id, aiGrants.userId))
        .where(eq(aiGrants.id, grantId));
      if (!row) throw new HttpError(401, "sign in required");
      req.user = row.user;
      req.email = row.user.email;
      // Staff rights need the staff scope and an address still on the list, checked on every call.
      req.admin = row.scope.split(" ").includes(SCOPE_STAFF) && row.user.email !== null && admins.has(row.user.email.toLowerCase());
      return;
    }
    const identity = await deps.authenticate(req);
    if (identity.unverified && !req.routeOptions.config.allowUnverified) throw new HttpError(403, "verify your email", { code: "email_unverified" });
    req.user = await upsertUser(deps.db, identity);
    req.email = identity.email;
    req.admin = identity.verifiedEmail !== null && admins.has(identity.verifiedEmail.toLowerCase());
  });

  app.setErrorHandler((err: unknown, _req: FastifyRequest, reply: FastifyReply) => {
    if (err instanceof HttpError) return reply.status(err.status).send({ error: err.message, details: err.details });
    if (err instanceof ZodError) return reply.status(400).send({ error: "invalid request", details: err.issues });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.status(status).send({ error: (err as Error).message });
    app.log.error(err);
    return reply.status(500).send({ error: "internal error" });
  });

  app.get("/health", async () => ({ ok: true }));
  app.register(relationshipRoutes(deps));
  app.register(taskRoutes(deps));
  app.register(statsRoutes(deps));
  app.register(monthRoutes(deps));
  app.register(pointsRoutes(deps));
  app.register(libraryRoutes(deps));
  app.register(proofRoutes(deps));
  app.register(eventRoutes(deps));
  app.register(adminRoutes(deps));
  app.register(commentRoutes(deps));
  app.register(limitRoutes(deps));
  app.register(limitListRoutes(deps));
  app.register(locationRoutes(deps));
  app.register(curfewRoutes(deps));
  app.register(ruleLogRoutes(deps));
  app.register(safeCallRoutes(deps));
  app.register(agreementRoutes(deps));
  app.register(sceneRoutes(deps));
  app.register(kitRoutes(deps));
  app.register(roleSwapRoutes(deps));
  app.register(chastityRoutes(deps));
  app.register(verificationRoutes(deps));
  app.register(imageryRoutes(deps));
  app.register(oauthRoutes(deps));
  app.register(aiAccessRoutes(deps));
  app.register(mcpRoutes(deps, { internalSecret }));
  return app;
}
