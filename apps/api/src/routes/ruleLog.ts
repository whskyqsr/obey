import { ruleLogInput } from "@obey/contracts";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Deps } from "../app.js";
import { consequences, protocols, ruleLog, rules } from "../db/schema.js";
import { HttpError, forbidden, notFound } from "../errors.js";
import { canManage, managers, membership, requireMember } from "../services/access.js";
import { issueConsequence } from "../services/scheduling.js";

const entryDto = (e: typeof ruleLog.$inferSelect) => ({
  id: e.id,
  relationshipId: e.relationshipId,
  subjectId: e.subjectId,
  loggedBy: e.loggedBy,
  ruleId: e.ruleId,
  protocolId: e.protocolId,
  title: e.title,
  note: e.note,
  occurredOn: e.occurredOn,
  consequenceTaskId: e.consequenceTaskId,
  createdAt: e.createdAt.toISOString(),
});

/**
 * The broken-rule log. A Dominant logs for anyone and may give a consequence in the same step; anyone may own up to
 * one of their own. Everyone in the dynamic reads it. The person who logged an entry, or a Dominant, can remove it.
 */
export const ruleLogRoutes = (deps: Deps) => async (app: FastifyInstance) => {
  const { db, notifier } = deps;

  app.get<{ Params: { id: string } }>("/relationships/:id/rule-log", async (req) => {
    await requireMember(db, req.params.id, req.user.id);
    const rows = await db.select().from(ruleLog).where(eq(ruleLog.relationshipId, req.params.id)).orderBy(desc(ruleLog.occurredOn), desc(ruleLog.createdAt)).limit(500);
    return rows.map(entryDto);
  });

  app.post<{ Params: { id: string } }>("/relationships/:id/rule-log", async (req, reply) => {
    const relationshipId = req.params.id;
    const me = await requireMember(db, relationshipId, req.user.id);
    const body = ruleLogInput.parse(req.body);
    const manager = canManage(me.role);
    if (body.subjectId !== req.user.id && !manager) throw forbidden("you can only log your own");
    if (body.consequence && !manager) throw forbidden("only a Dominant can give a consequence");
    if (!(await membership(db, relationshipId, body.subjectId))) throw new HttpError(400, "that person isn't in this dynamic");

    // The title comes from the protocol when there is one, since it's the more specific of the two.
    let title = "";
    if (body.ruleId) {
      const [r] = await db
        .select()
        .from(rules)
        .where(and(eq(rules.id, body.ruleId), eq(rules.relationshipId, relationshipId)));
      if (!r) throw new HttpError(400, "that rule isn't in this dynamic");
      title = r.title;
    }
    if (body.protocolId) {
      const [p] = await db
        .select()
        .from(protocols)
        .where(and(eq(protocols.id, body.protocolId), eq(protocols.relationshipId, relationshipId)));
      if (!p) throw new HttpError(400, "that protocol isn't in this dynamic");
      title = p.title;
    }
    let consequence: typeof consequences.$inferSelect | undefined;
    if (body.consequence) {
      [consequence] = await db
        .select()
        .from(consequences)
        .where(and(eq(consequences.id, body.consequence.consequenceId), eq(consequences.relationshipId, relationshipId)));
      if (!consequence) throw new HttpError(400, "that consequence isn't in this dynamic");
    }

    const entry = await db.transaction(async (tx) => {
      let consequenceTaskId: string | null = null;
      if (consequence && body.consequence) {
        const series = await issueConsequence(tx, consequence, { ...body.consequence, assigneeId: body.subjectId, reason: `Broke: ${title}`, createdBy: req.user.id }, deps.now());
        consequenceTaskId = series?.id ?? null;
      }
      const [e] = await tx
        .insert(ruleLog)
        .values({
          relationshipId,
          subjectId: body.subjectId,
          loggedBy: req.user.id,
          ruleId: body.ruleId,
          protocolId: body.protocolId,
          title,
          note: body.note,
          occurredOn: body.occurredOn,
          consequenceTaskId,
        })
        .returning();
      return e!;
    });

    // Discreet like every push: who, not what.
    if (body.subjectId !== req.user.id) {
      await notifier.send([body.subjectId], {
        title: "Fealty",
        body: entry.consequenceTaskId ? `${req.user.displayName} logged a broken rule and gave you a consequence` : `${req.user.displayName} logged a broken rule`,
        data: { type: "rule_log", entryId: entry.id },
      });
    } else {
      const doms = await managers(db, relationshipId, req.user.id);
      await notifier.send(doms, { title: "Fealty", body: `${req.user.displayName} owned up to a broken rule`, data: { type: "rule_log", entryId: entry.id } });
    }
    return reply.status(201).send(entryDto(entry));
  });

  app.delete<{ Params: { id: string } }>("/rule-log/:id", async (req, reply) => {
    const [e] = await db.select().from(ruleLog).where(eq(ruleLog.id, req.params.id));
    if (!e) throw notFound();
    const me = await requireMember(db, e.relationshipId, req.user.id);
    if (e.loggedBy !== req.user.id && !canManage(me.role)) throw forbidden("only whoever logged it, or a Dominant, can remove it");
    await db.delete(ruleLog).where(eq(ruleLog.id, e.id));
    return reply.status(204).send();
  });
};
