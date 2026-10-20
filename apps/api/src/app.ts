import cors from "@fastify/cors";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { ZodError, type ZodType } from "zod";
import { type Authenticator, upsertUser } from "./auth.js";
import type { Db } from "./db/index.js";
import type { users } from "./db/schema.js";
import { HttpError } from "./errors.js";
import type { Notifier } from "./notify.js";
import { requestScope } from "./services/access.js";
import { adminRoutes } from "./routes/admin.js";
import { eventRoutes } from "./routes/events.js";
import { libraryRoutes } from "./routes/library.js";
import { pointsRoutes } from "./routes/points.js";
import { proofRoutes } from "./routes/proofs.js";
import { relationshipRoutes } from "./routes/relationships.js";
import { taskRoutes } from "./routes/tasks.js";

export interface Deps {
  db: Db;
  authenticate: Authenticator;
  notifier: Notifier;
  now: () => Date;
  materializeDays: number;
  corsOrigins?: string[];
  /** People who review reports, by verified email (ADMIN_EMAILS). */
  adminEmails?: string[];
  logger?: boolean;
}

/** The caller, without the avatar bytes (those are only read by the avatar route). */
export type User = Omit<typeof users.$inferSelect, "avatar">;

declare module "fastify" {
  interface FastifyRequest {
    user: User;
    /** Signed in with a verified email listed in ADMIN_EMAILS. */
    admin: boolean;
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
  const admins = new Set((deps.adminEmails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean));
  // Callback style so the rest of the request runs inside the scope.
  app.addHook("onRequest", (req, _reply, done) => requestScope.run({ write: !["GET", "HEAD", "OPTIONS"].includes(req.method) }, done));
  app.addHook("onRequest", async (req: FastifyRequest) => {
    if (req.method === "OPTIONS" || req.url === "/health") return;
    const identity = await deps.authenticate(req);
    req.user = await upsertUser(deps.db, identity);
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
  app.register(pointsRoutes(deps));
  app.register(libraryRoutes(deps));
  app.register(proofRoutes(deps));
  app.register(eventRoutes(deps));
  app.register(adminRoutes(deps));
  return app;
}
