import { resolveReport } from "@obey/contracts";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Deps } from "../app.js";
import { occurrences, proofPhotos, reports, users } from "../db/schema.js";
import { notFound } from "../errors.js";

/** Same answer as a missing route, so the admin area doesn't show itself to anyone else. */
function requireAdmin(req: FastifyRequest) {
  if (!req.admin) throw notFound();
}

/** The moderation queue: reports people filed, and removing a reported photo. Web only, for the Fealty team. */
export const adminRoutes = (deps: Deps) => async (app: FastifyInstance) => {
  const { db } = deps;
  const reporter = alias(users, "reporter");
  const subject = alias(users, "subject");

  app.get<{ Querystring: { all?: string } }>("/admin/reports", async (req) => {
    requireAdmin(req);
    const rows = await db
      .select({
        r: reports,
        reporter: { id: reporter.id, displayName: reporter.displayName, email: reporter.email },
        subject: { id: subject.id, displayName: subject.displayName, email: subject.email },
      })
      .from(reports)
      .innerJoin(reporter, eq(reporter.id, reports.reporterId))
      .innerJoin(subject, eq(subject.id, reports.subjectId))
      .where(req.query.all === "1" ? undefined : isNull(reports.resolvedAt))
      .orderBy(desc(reports.createdAt))
      .limit(200);
    const photoIds = rows.map((x) => x.r.photoId).filter((p): p is string => p !== null);
    const alive = new Set(photoIds.length ? (await db.select({ id: proofPhotos.id }).from(proofPhotos).where(inArray(proofPhotos.id, photoIds))).map((p) => p.id) : []);
    return rows.map(({ r, reporter, subject }) => ({
      id: r.id,
      reason: r.reason,
      details: r.details,
      reporter,
      subject,
      photoId: r.photoId && alive.has(r.photoId) ? r.photoId : null,
      photoDeleted: r.photoId !== null && !alive.has(r.photoId),
      createdAt: r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
    }));
  });

  /** A reported photo, for the person reviewing the report. */
  app.get<{ Params: { id: string } }>("/admin/photos/:id", async (req, reply) => {
    requireAdmin(req);
    const [reported] = await db.select({ id: reports.id }).from(reports).where(eq(reports.photoId, req.params.id)).limit(1);
    if (!reported) throw notFound();
    const [row] = await db.select({ data: proofPhotos.data, type: proofPhotos.contentType }).from(proofPhotos).where(eq(proofPhotos.id, req.params.id));
    if (!row) throw notFound("no photo");
    return reply.header("content-type", row.type).header("cache-control", "no-store").send(row.data);
  });

  /** Closes a report, optionally deleting the reported photo for good. */
  app.post<{ Params: { id: string } }>("/admin/reports/:id/resolve", async (req) => {
    requireAdmin(req);
    const body = resolveReport.parse(req.body ?? {});
    const [report] = await db.select().from(reports).where(eq(reports.id, req.params.id));
    if (!report) throw notFound();
    await db.transaction(async (tx) => {
      if (body.removePhoto && report.photoId) {
        const [gone] = await tx.delete(proofPhotos).where(eq(proofPhotos.id, report.photoId)).returning({ occurrenceId: proofPhotos.occurrenceId });
        if (gone) {
          await tx
            .update(occurrences)
            .set({ photoCount: sql`greatest(${occurrences.photoCount} - 1, 0)` })
            .where(eq(occurrences.id, gone.occurrenceId));
        }
      }
      // Every open report about the same photo is settled together.
      const same = report.photoId && body.removePhoto ? eq(reports.photoId, report.photoId) : eq(reports.id, report.id);
      await tx
        .update(reports)
        .set({ resolvedAt: deps.now() })
        .where(and(same, isNull(reports.resolvedAt)));
    });
    return { ok: true };
  });
};

/** Account ids to tell about a new report: anyone whose address is on the admin list. */
export async function adminUserIds(deps: Deps): Promise<string[]> {
  const emails = (deps.adminEmails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!emails.length) return [];
  const rows = await deps.db
    .select({ id: users.id })
    .from(users)
    .where(inArray(sql`lower(${users.email})`, emails));
  return rows.map((r) => r.id);
}
