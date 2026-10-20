import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { consequenceInput, noteInput, protocolInput, reorderInput, rewardInput, ruleInput } from "@obey/contracts";
import type { ZodObject, ZodRawShape } from "zod";
import type { Deps } from "../app.js";
import { consequences, notes, protocols, rewards, rules } from "../db/schema.js";
import { HttpError, forbidden, notFound, parsePatch } from "../errors.js";
import { libraryDto, noteDto } from "../serialize.js";
import { requireManager, requireMember } from "../services/access.js";

/** Rewards, consequences, rules and protocols: anyone in the relationship reads, Dominants write. */
const LIBRARIES = [
  { path: "rewards", table: rewards, input: rewardInput, order: asc(rewards.cost) },
  { path: "consequences", table: consequences, input: consequenceInput, order: asc(consequences.severity) },
  { path: "rules", table: rules, input: ruleInput, order: asc(rules.position) },
  { path: "protocols", table: protocols, input: protocolInput, order: asc(protocols.position) },
] as const;

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
        const [{ last }] = (await db.select({ last: sql<number>`coalesce(max(${p}), 0)::int` }).from(t).where(eq(t.relationshipId, req.params.id))) as [
          { last: number },
        ];
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
  // Only the author edits or deletes.
  app.get<{ Params: { id: string } }>("/relationships/:id/notes", async (req) => {
    await requireMember(db, req.params.id, req.user.id);
    const rows = await db
      .select()
      .from(notes)
      .where(and(eq(notes.relationshipId, req.params.id), or(eq(notes.visibility, "shared"), eq(notes.authorId, req.user.id))))
      .orderBy(desc(notes.pinned), desc(notes.updatedAt));
    return rows.map(noteDto);
  });

  app.post<{ Params: { id: string } }>("/relationships/:id/notes", async (req, reply) => {
    await requireMember(db, req.params.id, req.user.id);
    const body = noteInput.parse(req.body);
    const [row] = await db.insert(notes).values({ ...body, relationshipId: req.params.id, authorId: req.user.id }).returning();
    reply.status(201);
    return noteDto(row!);
  });

  const ownNote = async (id: string, userId: string) => {
    const [note] = await db.select().from(notes).where(eq(notes.id, id));
    if (!note) throw notFound();
    await requireMember(db, note.relationshipId, userId);
    if (note.authorId !== userId) {
      if (note.visibility === "private") throw notFound();
      throw forbidden("only the author can change this note");
    }
    return note;
  };

  app.patch<{ Params: { id: string } }>("/notes/:id", async (req) => {
    const note = await ownNote(req.params.id, req.user.id);
    const body = parsePatch(noteInput.partial(), req.body);
    const [row] = await db.update(notes).set({ ...body, updatedAt: deps.now() }).where(eq(notes.id, note.id)).returning();
    return noteDto(row!);
  });

  app.delete<{ Params: { id: string } }>("/notes/:id", async (req, reply) => {
    const note = await ownNote(req.params.id, req.user.id);
    await db.delete(notes).where(eq(notes.id, note.id));
    reply.status(204);
  });
};
