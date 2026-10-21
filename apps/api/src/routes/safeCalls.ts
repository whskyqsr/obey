import { type SafeCall, type SafeCalls, safeCallInput } from "@obey/contracts";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Deps } from "../app.js";
import { memberships, safeCalls } from "../db/schema.js";
import { notFound } from "../errors.js";
import { requireMember } from "../services/access.js";

const callDto = (c: typeof safeCalls.$inferSelect): SafeCall => ({
  id: c.id,
  relationshipId: c.relationshipId,
  callerId: c.callerId,
  level: c.level,
  note: c.note,
  createdAt: c.createdAt.toISOString(),
  clearedAt: c.clearedAt?.toISOString() ?? null,
  clearedBy: c.clearedBy,
});

/**
 * Safe words. Anyone in a dynamic can call yellow or red; everyone else is told at once, through quiet hours.
 * A dynamic has at most one open call: calling again changes its level. Anyone in the dynamic can clear it.
 */
export const safeCallRoutes = (deps: Deps) => async (app: FastifyInstance) => {
  const { db, notifier } = deps;

  const others = async (relationshipId: string, me: string) =>
    (await db.select({ userId: memberships.userId }).from(memberships).where(eq(memberships.relationshipId, relationshipId))).map((m) => m.userId).filter((id) => id !== me);

  app.get<{ Params: { id: string } }>("/relationships/:id/safe-calls", async (req): Promise<SafeCalls> => {
    await requireMember(db, req.params.id, req.user.id);
    const rows = await db.select().from(safeCalls).where(eq(safeCalls.relationshipId, req.params.id)).orderBy(desc(safeCalls.createdAt)).limit(20);
    const active = rows.find((r) => !r.clearedAt);
    return { active: active ? callDto(active) : null, recent: rows.map(callDto) };
  });

  app.post<{ Params: { id: string } }>("/relationships/:id/safe-calls", async (req, reply) => {
    const relationshipId = req.params.id;
    await requireMember(db, relationshipId, req.user.id);
    const body = safeCallInput.parse(req.body);
    const [open] = await db
      .select()
      .from(safeCalls)
      .where(and(eq(safeCalls.relationshipId, relationshipId), isNull(safeCalls.clearedAt)));
    const [call] = open
      ? await db
          .update(safeCalls)
          .set({ level: body.level, note: body.note || open.note, callerId: req.user.id })
          .where(eq(safeCalls.id, open.id))
          .returning()
      : await db.insert(safeCalls).values({ relationshipId, callerId: req.user.id, level: body.level, note: body.note, createdAt: deps.now() }).returning();
    // The note stays in the app: the lock screen only says who called what.
    await notifier.send(await others(relationshipId, req.user.id), {
      title: "Fealty",
      body: `${req.user.displayName} called ${body.level}`,
      data: { type: "safe_call", callId: call!.id, level: body.level },
      urgent: true,
    });
    return reply.status(open ? 200 : 201).send(callDto(call!));
  });

  app.post<{ Params: { id: string } }>("/safe-calls/:id/clear", async (req) => {
    const [call] = await db.select().from(safeCalls).where(eq(safeCalls.id, req.params.id));
    if (!call) throw notFound();
    await requireMember(db, call.relationshipId, req.user.id);
    if (call.clearedAt) return callDto(call);
    const [cleared] = await db.update(safeCalls).set({ clearedAt: deps.now(), clearedBy: req.user.id }).where(eq(safeCalls.id, call.id)).returning();
    await notifier.send(await others(call.relationshipId, req.user.id), {
      title: "Fealty",
      body: `${req.user.displayName} cleared the ${call.level} call`,
      data: { type: "safe_call_cleared", callId: call.id },
    });
    return callDto(cleared!);
  });
};
