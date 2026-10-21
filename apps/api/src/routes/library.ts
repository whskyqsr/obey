import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { consequenceInput, noteInput, protocolInput, reorderInput, rewardInput, ruleInput } from "@obey/contracts";
import type { ZodObject, ZodRawShape } from "zod";
import type { Deps } from "../app.js";
import { consequences, noteRevisions, notes, protocols, relationships, rewards, rules } from "../db/schema.js";
import { HttpError, forbidden, notFound, parsePatch } from "../errors.js";
import { libraryDto, noteDto } from "../serialize.js";
import { type Role, canManage, requireManager, requireMember } from "../services/access.js";

/** Rewards, consequences, rules and protocols: anyone in the relationship reads, Dominants write. */
const LIBRARIES = [
  { path: "rewards", table: rewards, input: rewardInput, order: asc(rewards.cost) },
  { path: "consequences", table: consequences, input: consequenceInput, order: asc(consequences.severity) },
  { path: "rules", table: rules, input: ruleInput, order: asc(rules.position) },
  { path: "protocols", table: protocols, input: protocolInput, order: asc(protocols.position) },
] as const;

/** Saves by one person this close together count as one edit in a note's history. */
const SITTING_MS = 10 * 60_000;

export const libraryRoutes = (deps: Deps) => async (app: FastifyInstance) => {
  const { db } = deps;

  for (const { path, table, input, order } of LIBRARIES) {
    // A protocol may only point at a rule in its own relationship.
    const checkRule = async (body: { ruleId?: string | null }, relationshipId: string) => {
      if (path !== "protocols" || !body.ruleId) return;
      const [r] = await db.select({ relationshipId: rules.relationshipId }).from(rules).where(eq(rules.id, body.ruleId));
      if (r?.relationshipId !== relationshipId) throw new HttpError(400, "that rule isn't in this relationship");
    };
    // The tables share id/relationshipId columns; drizzle's types can't express that union generically.
    const t = table as typeof rewards;
    const schema = input as unknown as ZodObject<ZodRawShape>;

    app.get<{ Params: { id: string } }>(`/relationships/:id/${path}`, async (req) => {
      await requireMember(db, req.params.id, req.user.id);
      const rows = await db.select().from(t).where(eq(t.relationshipId, req.params.id)).orderBy(order);
      return rows.map(libraryDto);
    });

    app.post<{ Params: { id: string } }>(`/relationships/:id/${path}`, async (req, reply) => {
      await requireManager(db, req.params.id, req.user.id);
      const body = schema.parse(req.body);
      await checkRule(body as { ruleId?: string | null }, req.params.id);
      if (path === "rules" || path === "protocols") {
        // New rules and protocols go to the end of the list.
        const p = (t as unknown as typeof rules).position;
        const [{ last }] = (await db
          .select({ last: sql<number>`coalesce(max(${p}), 0)::int` })
          .from(t)
          .where(eq(t.relationshipId, req.params.id))) as [{ last: number }];
        (body as { position: number }).position = last + 1;
      }
      const [row] = await db
        .insert(t)
        .values({ ...(body as object), relationshipId: req.params.id } as typeof rewards.$inferInsert)
        .returning();
      reply.status(201);
      return libraryDto(row!);
    });

    if (path === "rules" || path === "protocols") {
      // Drag-to-reorder: numbers follow the given order; ids from other relationships are ignored.
      app.put<{ Params: { id: string } }>(`/relationships/:id/${path}/order`, async (req) => {
        await requireManager(db, req.params.id, req.user.id);
        const { ids } = reorderInput.parse(req.body);
        if (ids.length) {
          const cases = sql.join(
            ids.map((rowId, i) => sql`when ${rowId}::uuid then ${i + 1}`),
            sql` `,
          );
          await db
            .update(t)
            .set({ position: sql`case ${t.id} ${cases} else ${(t as unknown as typeof rules).position} end` } as never)
            .where(and(eq(t.relationshipId, req.params.id), inArray(t.id, ids)));
        }
        const rows = await db.select().from(t).where(eq(t.relationshipId, req.params.id)).orderBy(order);
        return rows.map(libraryDto);
      });
    }

    app.patch<{ Params: { id: string } }>(`/${path}/:id`, async (req) => {
      const [existing] = await db.select().from(t).where(eq(t.id, req.params.id));
      if (!existing) throw notFound();
      await requireManager(db, existing.relationshipId, req.user.id);
      const body = parsePatch(schema.partial(), req.body) as Partial<typeof rewards.$inferInsert>;
      await checkRule(body as { ruleId?: string | null }, existing.relationshipId);
      const [row] = await db.update(t).set(body).where(eq(t.id, existing.id)).returning();
      return libraryDto(row!);
    });

    app.delete<{ Params: { id: string } }>(`/${path}/:id`, async (req, reply) => {
      const [existing] = await db.select().from(t).where(eq(t.id, req.params.id));
      if (!existing) throw notFound();
      await requireManager(db, existing.relationshipId, req.user.id);
      await db.delete(t).where(eq(t.id, existing.id));
      reply.status(204);
    });
  }

  // Notes: shared notes are visible to everyone in the relationship, private ones only to their author.
  // The author edits and deletes. A Dominant decides whether a submissive writes notes at all (subNotes)
  // and can let them edit a shared note of theirs (subCanEdit), which covers its title, text and tags only.
  type NoteRow = typeof notes.$inferSelect;
  type Viewer = { userId: string; role: Role; subNotes: boolean };
  const viewer = async (relationshipId: string, userId: string): Promise<Viewer> => {
    const m = await requireMember(db, relationshipId, userId);
    const [rel] = await db.select({ subNotes: relationships.subNotes }).from(relationships).where(eq(relationships.id, relationshipId));
    return { userId, role: m.role, subNotes: rel!.subNotes };
  };
  // Journal entries have their own feature switch, so subNotes covers notes only.
  const mayWriteOwn = (v: Viewer, kind: NoteRow["kind"]) => kind === "journal" || v.role !== "submissive" || v.subNotes;
  const sharedWithMe = (v: Viewer, n: NoteRow) => n.authorId !== v.userId && n.visibility === "shared" && n.subCanEdit && v.role === "submissive";
  const canEditNote = (v: Viewer, n: NoteRow) => (n.authorId === v.userId ? mayWriteOwn(v, n.kind) : sharedWithMe(v, n));
  // Only a Dominant's shared note can be opened up to the sub.
  const subCanEdit = (v: Viewer, kind: NoteRow["kind"], visibility: NoteRow["visibility"], want: boolean) =>
    want && canManage(v.role) && kind === "note" && visibility === "shared";

  app.get<{ Params: { id: string } }>("/relationships/:id/notes", async (req) => {
    const v = await viewer(req.params.id, req.user.id);
    const rows = await db
      .select()
      .from(notes)
      .where(and(eq(notes.relationshipId, req.params.id), or(eq(notes.visibility, "shared"), eq(notes.authorId, req.user.id))))
      .orderBy(desc(notes.pinned), desc(notes.updatedAt));
    return rows.map((n) => noteDto(n, canEditNote(v, n)));
  });

  app.post<{ Params: { id: string } }>("/relationships/:id/notes", async (req, reply) => {
    const v = await viewer(req.params.id, req.user.id);
    const body = noteInput.parse(req.body);
    if (!mayWriteOwn(v, body.kind)) throw forbidden("your Dominant hasn't turned on writing notes");
    const [row] = await db
      .insert(notes)
      .values({ ...body, subCanEdit: subCanEdit(v, body.kind, body.visibility, body.subCanEdit), relationshipId: req.params.id, authorId: req.user.id })
      .returning();
    reply.status(201);
    return noteDto(row!, true);
  });

  const findNote = async (id: string, userId: string) => {
    const [note] = await db.select().from(notes).where(eq(notes.id, id));
    if (!note) throw notFound();
    const v = await viewer(note.relationshipId, userId);
    if (note.authorId !== userId && note.visibility === "private") throw notFound();
    return { note, v };
  };

  app.patch<{ Params: { id: string } }>("/notes/:id", async (req) => {
    const { note, v } = await findNote(req.params.id, req.user.id);
    if (!canEditNote(v, note)) throw forbidden(note.authorId === v.userId ? "your Dominant hasn't turned on writing notes" : "only the author can change this note");
    const body = parsePatch(noteInput.partial(), req.body);
    let set: Partial<NoteRow>;
    if (note.authorId === v.userId) {
      const kind = body.kind ?? note.kind;
      const visibility = body.visibility ?? note.visibility;
      set = { ...body, subCanEdit: subCanEdit(v, kind, visibility, body.subCanEdit ?? note.subCanEdit) };
    } else {
      set = { title: body.title, bodyMd: body.bodyMd, tags: body.tags };
    }
    const now = deps.now();
    const textChanged = (set.title !== undefined && set.title !== note.title) || (set.bodyMd !== undefined && set.bodyMd !== note.bodyMd);
    const row = await db.transaction(async (tx) => {
      // Keep the version this edit replaces. Saves by the same person within a few minutes are one sitting, whose
      // starting version is already kept, so ticking a checklist or saving twice doesn't fill the history.
      if (textChanged) {
        const [last] = await tx.select().from(noteRevisions).where(eq(noteRevisions.noteId, note.id)).orderBy(desc(noteRevisions.createdAt)).limit(1);
        const sameSitting = last && last.editorId === v.userId && now.getTime() - last.createdAt.getTime() < SITTING_MS;
        if (!sameSitting) {
          await tx.insert(noteRevisions).values({ noteId: note.id, editorId: v.userId, title: note.title, bodyMd: note.bodyMd, createdAt: now });
          set = { ...set, revisionCount: note.revisionCount + 1 };
        }
      }
      const [r] = await tx
        .update(notes)
        .set({ ...set, updatedAt: now })
        .where(eq(notes.id, note.id))
        .returning();
      return r!;
    });
    return noteDto(row, canEditNote(v, row));
  });

  app.get<{ Params: { id: string } }>("/notes/:id/revisions", async (req) => {
    const { note } = await findNote(req.params.id, req.user.id);
    const rows = await db.select().from(noteRevisions).where(eq(noteRevisions.noteId, note.id)).orderBy(desc(noteRevisions.createdAt));
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  });

  app.delete<{ Params: { id: string } }>("/notes/:id", async (req, reply) => {
    const { note, v } = await findNote(req.params.id, req.user.id);
    if (note.authorId !== v.userId) throw forbidden("only the author can delete this note");
    await db.delete(notes).where(eq(notes.id, note.id));
    reply.status(204);
  });
};
