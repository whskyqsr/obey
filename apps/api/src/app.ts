import cors from "@fastify/cors";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { ZodError, type ZodType } from "zod";
import { type Authenticator, upsertUser } from "./auth.js";
import type { Db } from "./db/index.js";
import type { users } from "./db/schema.js";
import { HttpError } from "./errors.js";
import type { Notifier } from "./notify.js";
import { libraryRoutes } from "./routes/library.js";
import { pointsRoutes } from "./routes/points.js";
import { relationshipRoutes } from "./routes/relationships.js";
import { taskRoutes } from "./routes/tasks.js";

export interface Deps {
  db: Db;
  authenticate: Authenticator;
  notifier: Notifier;
  now: () => Date;
  materializeDays: number;
  corsOrigins?: string[];
  logger?: boolean;
}

/** The caller, without the avatar bytes (those are only read by the avatar route). */
export type User = Omit<typeof users.$inferSelect, "avatar">;

declare module "fastify" {
  interface FastifyRequest {
    user: User;
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
  app.addHook("onRequest", async (req: FastifyRequest) => {
    if (req.method === "OPTIONS" || req.url === "/health") return;
    req.user = await upsertUser(deps.db, await deps.authenticate(req));
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
  return app;
}
