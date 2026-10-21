import { commentInput } from "@obey/contracts";
import { asc, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Deps } from "../app.js";
import type { Tx } from "../db/index.js";
import { memberships, noteComments, notes, occurrenceComments, occurrences } from "../db/schema.js";
import { forbidden, notFound } from "../errors.js";
import { canManage, requireMember } from "../services/access.js";
import { loadOccurrence } from "./tasks.js";
import { sendWithWords } from "../notify.js";

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

const noteCommentDto = (c: typeof noteComments.$inferSelect) => ({
  id: c.id,
  noteId: c.noteId,
  authorId: c.authorId,
  body: c.body,
  createdAt: c.createdAt.toISOString(),
});

/** A note the user may read: anyone in the dynamic for a shared one, only its author for a private one. */
async function loadReadableNote(db: Tx, id: string, userId: string) {
  const [note] = await db.select().from(notes).where(eq(notes.id, id));
  if (!note) throw notFound();
  await requireMember(db, note.relationshipId, userId);
  if (note.visibility === "private" && note.authorId !== userId) throw notFound();
  return note;
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
    const { occ, series, member } = await loadOccurrence(db, req.params.id, req.user.id);
    const c = await db.transaction(async (tx) => {
      // A Dominant replying to a check-in has seen its mood.
      if (occ.mood !== null && !occ.moodSeenAt && canManage(member.role) && req.user.id !== series.assigneeId)
        await tx.update(occurrences).set({ moodSeenAt: deps.now() }).where(eq(occurrences.id, occ.id));
      return addComment(tx, occ.id, req.user.id, body.body);
    });
    const others = (await db.select({ id: memberships.userId }).from(memberships).where(eq(memberships.relationshipId, series.relationshipId)))
      .map((m) => m.id)
      .filter((id) => id !== req.user.id);
    // Discreet unless someone lets notifications carry their partner's words: who, not what.
    const push = {
      title: "Fealty",
      body: series.curfewUntil ? `${req.user.displayName} left you a note about curfew` : `${req.user.displayName} commented on a task`,
      data: { type: "occurrence_comment", occurrenceId: occ.id },
    };
    await sendWithWords(db, deps.notifier, others, push, { ...push, body: `${req.user.displayName} on ${series.curfewUntil ? "curfew" : series.title}: “${c.body}”` });
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

  // Comments on a journal entry or note, from anyone who can read it; each person deletes only their own.
  app.get<{ Params: { id: string } }>("/notes/:id/comments", async (req) => {
    await loadReadableNote(db, req.params.id, req.user.id);
    const rows = await db.select().from(noteComments).where(eq(noteComments.noteId, req.params.id)).orderBy(asc(noteComments.createdAt));
    return rows.map(noteCommentDto);
  });

  app.post<{ Params: { id: string } }>("/notes/:id/comments", async (req, reply) => {
    const body = commentInput.parse(req.body);
    const note = await loadReadableNote(db, req.params.id, req.user.id);
    const c = await db.transaction(async (tx) => {
      const [row] = await tx.insert(noteComments).values({ noteId: note.id, authorId: req.user.id, body: body.body }).returning();
      await tx
        .update(notes)
        .set({ commentCount: sql`${notes.commentCount} + 1` })
        .where(eq(notes.id, note.id));
      return noteCommentDto(row!);
    });
    const others =
      note.visibility === "shared"
        ? (await db.select({ id: memberships.userId }).from(memberships).where(eq(memberships.relationshipId, note.relationshipId)))
            .map((m) => m.id)
            .filter((id) => id !== req.user.id)
        : [];
    const push = {
      title: "Fealty",
      body: `${req.user.displayName} commented on ${note.kind === "journal" ? "a journal entry" : "a note"}`,
      data: { type: "note_comment", noteId: note.id },
    };
    await sendWithWords(db, deps.notifier, others, push, { ...push, body: `${req.user.displayName}: “${c.body}”` });
    return reply.status(201).send(c);
  });

  app.delete<{ Params: { id: string } }>("/note-comments/:id", async (req, reply) => {
    const [c] = await db.select().from(noteComments).where(eq(noteComments.id, req.params.id));
    if (!c) throw notFound();
    await loadReadableNote(db, c.noteId, req.user.id);
    if (c.authorId !== req.user.id) throw forbidden("you can only delete your own comments");
    await db.transaction(async (tx) => {
      await tx.delete(noteComments).where(eq(noteComments.id, c.id));
      await tx
        .update(notes)
        .set({ commentCount: sql`greatest(${notes.commentCount} - 1, 0)` })
        .where(eq(notes.id, c.noteId));
    });
    return reply.status(204).send();
  });
};
