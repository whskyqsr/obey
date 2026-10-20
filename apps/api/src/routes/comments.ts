import { commentInput } from "@obey/contracts";
import { asc, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Deps } from "../app.js";
import type { Tx } from "../db/index.js";
import { memberships, occurrenceComments, occurrences } from "../db/schema.js";
import { forbidden, notFound } from "../errors.js";
import { loadOccurrence } from "./tasks.js";

const commentDto = (c: typeof occurrenceComments.$inferSelect) => ({
  id: c.id,
  occurrenceId: c.occurrenceId,
  authorId: c.authorId,
  body: c.body,
  createdAt: c.createdAt.toISOString(),
});

export async function addComment(db: Tx, occurrenceId: string, authorId: string, body: string) {
  const [c] = await db.insert(occurrenceComments).values({ occurrenceId, authorId, body }).returning();
  await db
    .update(occurrences)
    .set({ commentCount: sql`${occurrences.commentCount} + 1` })
    .where(eq(occurrences.id, occurrenceId));
  return commentDto(c!);
}

/** Comments on one occurrence. Anyone in the dynamic reads and writes them; each person deletes only their own. */
export const commentRoutes = (deps: Deps) => async (app: FastifyInstance) => {
  const { db } = deps;

  app.get<{ Params: { id: string } }>("/occurrences/:id/comments", async (req) => {
    await loadOccurrence(db, req.params.id, req.user.id);
    const rows = await db.select().from(occurrenceComments).where(eq(occurrenceComments.occurrenceId, req.params.id)).orderBy(asc(occurrenceComments.createdAt));
    return rows.map(commentDto);
  });

  app.post<{ Params: { id: string } }>("/occurrences/:id/comments", async (req, reply) => {
    const body = commentInput.parse(req.body);
    const { occ, series } = await loadOccurrence(db, req.params.id, req.user.id);
    const c = await db.transaction((tx) => addComment(tx, occ.id, req.user.id, body.body));
    const others = (await db.select({ id: memberships.userId }).from(memberships).where(eq(memberships.relationshipId, series.relationshipId)))
      .map((m) => m.id)
      .filter((id) => id !== req.user.id);
    // Discreet like every push: who, not what.
    await deps.notifier.send(others, {
      title: "Fealty",
      body: `${req.user.displayName} commented on a task`,
      data: { type: "occurrence_comment", occurrenceId: occ.id },
    });
    return reply.status(201).send(c);
  });

  app.delete<{ Params: { id: string } }>("/comments/:id", async (req, reply) => {
    const [c] = await db.select().from(occurrenceComments).where(eq(occurrenceComments.id, req.params.id));
    if (!c) throw notFound();
    await loadOccurrence(db, c.occurrenceId, req.user.id);
    if (c.authorId !== req.user.id) throw forbidden("you can only delete your own comments");
    await db.transaction(async (tx) => {
      await tx.delete(occurrenceComments).where(eq(occurrenceComments.id, c.id));
      await tx
        .update(occurrences)
        .set({ commentCount: sql`greatest(${occurrences.commentCount} - 1, 0)` })
        .where(eq(occurrences.id, c.occurrenceId));
    });
    return reply.status(204).send();
  });
};
