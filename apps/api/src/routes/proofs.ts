import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { acceptProofTerms, id, reportInput } from "@obey/contracts";
import type { Deps } from "../app.js";
import { adminUserIds } from "./admin.js";
import { memberships, occurrences, proofPhotos, reports, taskSeries, users } from "../db/schema.js";
import { HttpError, forbidden, notFound } from "../errors.js";
import { requireMember } from "../services/access.js";
import { loadOccurrence } from "./tasks.js";
import { userDto } from "./relationships.js";

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
/** Clients shrink photos first (about 2000px on the long side), so this leaves room without inviting raw camera files. */
const MAX_PHOTO_BYTES = 4_000_000;
const MAX_PHOTOS = 6;

const photoDto = (p: { id: string; occurrenceId: string; uploaderId: string; createdAt: Date }) => ({
  id: p.id,
  occurrenceId: p.occurrenceId,
  uploaderId: p.uploaderId,
  createdAt: p.createdAt.toISOString(),
});

/**
 * Photo proof, built to Google Play's rules for user uploads: terms and an 18+ confirmation before the first upload,
 * reporting, and real deletion. Photos are only ever visible to the people in the dynamic the task belongs to.
 */
export const proofRoutes = (deps: Deps) => async (app: FastifyInstance) => {
  const { db } = deps;

  app.addContentTypeParser(PHOTO_TYPES, { parseAs: "buffer", bodyLimit: MAX_PHOTO_BYTES }, (_req, body, done) => done(null, body));

  /** The photo with its task, if the caller shares the dynamic it belongs to. */
  async function loadPhoto(photoId: string, userId: string) {
    if (!id.safeParse(photoId).success) throw notFound("no photo");
    const [row] = await db
      .select({
        photo: { id: proofPhotos.id, occurrenceId: proofPhotos.occurrenceId, uploaderId: proofPhotos.uploaderId, createdAt: proofPhotos.createdAt },
        relationshipId: taskSeries.relationshipId,
      })
      .from(proofPhotos)
      .innerJoin(occurrences, eq(proofPhotos.occurrenceId, occurrences.id))
      .innerJoin(taskSeries, eq(occurrences.seriesId, taskSeries.id))
      .where(eq(proofPhotos.id, photoId));
    if (!row) throw notFound("no photo");
    await requireMember(db, row.relationshipId, userId);
    return row.photo;
  }

  app.post("/me/proof-terms", async (req) => {
    acceptProofTerms.parse(req.body);
    const now = deps.now();
    const [updated] = await db.update(users).set({ proofTermsAcceptedAt: now }).where(eq(users.id, req.user.id)).returning();
    return userDto(updated!);
  });

  app.get<{ Params: { id: string } }>("/occurrences/:id/photos", async (req) => {
    const { occ } = await loadOccurrence(db, req.params.id, req.user.id);
    const rows = await db
      .select({ id: proofPhotos.id, occurrenceId: proofPhotos.occurrenceId, uploaderId: proofPhotos.uploaderId, createdAt: proofPhotos.createdAt })
      .from(proofPhotos)
      .where(eq(proofPhotos.occurrenceId, occ.id))
      .orderBy(asc(proofPhotos.createdAt));
    return rows.map(photoDto);
  });

  app.post<{ Params: { id: string } }>("/occurrences/:id/photos", async (req, reply) => {
    const type = req.headers["content-type"]?.split(";")[0]?.trim() ?? "";
    if (!PHOTO_TYPES.includes(type) || !Buffer.isBuffer(req.body) || req.body.length === 0) throw new HttpError(415, "send a JPEG, PNG or WebP image");
    if (!req.user.proofTermsAcceptedAt) throw new HttpError(403, "accept the rules for proof photos first");
    const { occ, series } = await loadOccurrence(db, req.params.id, req.user.id);
    if (req.user.id !== series.assigneeId) throw forbidden("only the assignee adds proof");
    if (occ.status !== "pending" && occ.status !== "submitted") throw new HttpError(409, `occurrence is ${occ.status}`);
    if (occ.photoCount >= MAX_PHOTOS) throw new HttpError(409, `at most ${MAX_PHOTOS} photos per task`);
    const photo = await db.transaction(async (tx) => {
      const [p] = await tx
        .insert(proofPhotos)
        .values({ occurrenceId: occ.id, uploaderId: req.user.id, data: req.body as Buffer, contentType: type })
        .returning({
          id: proofPhotos.id,
          occurrenceId: proofPhotos.occurrenceId,
          uploaderId: proofPhotos.uploaderId,
          createdAt: proofPhotos.createdAt,
        });
      await tx
        .update(occurrences)
        .set({ photoCount: sql`${occurrences.photoCount} + 1` })
        .where(eq(occurrences.id, occ.id));
      return p!;
    });
    return reply.status(201).send(photoDto(photo));
  });

  app.get<{ Params: { id: string } }>("/photos/:id", async (req, reply) => {
    await loadPhoto(req.params.id, req.user.id);
    const [row] = await db.select({ data: proofPhotos.data, type: proofPhotos.contentType }).from(proofPhotos).where(eq(proofPhotos.id, req.params.id));
    if (!row) throw notFound("no photo");
    // Private, and never stored by shared caches. A photo never changes, so the browser may keep its own copy.
    return reply.header("content-type", row.type).header("cache-control", "private, max-age=86400").send(row.data);
  });

  /** Only the person who took it can delete a photo, and deleting it removes the bytes for good. */
  app.delete<{ Params: { id: string } }>("/photos/:id", async (req, reply) => {
    const photo = await loadPhoto(req.params.id, req.user.id);
    if (photo.uploaderId !== req.user.id) throw forbidden("only the person who added a photo can delete it");
    await db.transaction(async (tx) => {
      await tx.delete(proofPhotos).where(eq(proofPhotos.id, photo.id));
      await tx
        .update(occurrences)
        .set({ photoCount: sql`greatest(${occurrences.photoCount} - 1, 0)` })
        .where(eq(occurrences.id, photo.occurrenceId));
    });
    return reply.status(204).send();
  });

  /** A report goes to the moderation queue. You can only report someone you share a dynamic with. */
  app.post("/reports", async (req, reply) => {
    const body = reportInput.parse(req.body);
    if (body.subjectId === req.user.id) throw new HttpError(400, "you can't report yourself");
    const mine = db.select({ id: memberships.relationshipId }).from(memberships).where(eq(memberships.userId, req.user.id));
    const [shared] = await db
      .select({ id: memberships.relationshipId })
      .from(memberships)
      .where(and(eq(memberships.userId, body.subjectId), inArray(memberships.relationshipId, mine)))
      .limit(1);
    if (!shared) throw notFound("no such person");
    if (body.photoId) {
      const photo = await loadPhoto(body.photoId, req.user.id);
      if (photo.uploaderId !== body.subjectId) throw new HttpError(400, "that photo isn't theirs");
    }
    const [report] = await db
      .insert(reports)
      .values({ reporterId: req.user.id, subjectId: body.subjectId, photoId: body.photoId ?? null, reason: body.reason, details: body.details ?? null })
      .returning({ id: reports.id });
    app.log.warn({ reportId: report!.id, reason: body.reason }, "content report filed");
    await deps.notifier.send(await adminUserIds(deps), { title: "Fealty", body: "A new report needs review", data: { type: "report", url: "/admin/reports" } });
    return reply.status(201).send({ id: report!.id });
  });
};
