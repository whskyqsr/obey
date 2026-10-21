import { arriveOccurrence, leaveOccurrence, pauseLocation, placeInput, reportLocation } from "@obey/contracts";
import { and, asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Deps } from "../app.js";
import { memberships, places, taskSeries, users } from "../db/schema.js";
import { HttpError, notFound, parsePatch } from "../errors.js";
import { occurrenceDto } from "../serialize.js";
import { managers, requireManager, requireMember } from "../services/access.js";
import { photonGeocoder } from "../services/geocode.js";
import { reportsHome } from "../services/curfew.js";
import { arriveAt, leaveFrom } from "../services/location.js";
import { countUsage } from "../services/usage.js";
import { loadOccurrence } from "./tasks.js";

/**
 * Location tasks: places a Dominant saves, and the arrivals and departures a sub's phone (or browser) reports for them.
 * Only those reports are ever sent, never a running position.
 */
export const locationRoutes = (deps: Deps) => async (app: FastifyInstance) => {
  const { db, notifier } = deps;

  const placeDto = (p: typeof places.$inferSelect, taskTitles: string[]) => ({
    id: p.id,
    relationshipId: p.relationshipId,
    name: p.name,
    address: p.address,
    lat: p.lat,
    lng: p.lng,
    radiusM: p.radiusM,
    createdAt: p.createdAt.toISOString(),
    taskTitles,
  });
  const titlesFor = async (relationshipId: string) => {
    const rows = await db
      .select({ placeId: taskSeries.placeId, title: taskSeries.title })
      .from(taskSeries)
      .where(and(eq(taskSeries.relationshipId, relationshipId), eq(taskSeries.active, true)));
    return (placeId: string) => rows.filter((r) => r.placeId === placeId).map((r) => r.title);
  };
  const loadPlace = async (id: string, userId: string) => {
    const [p] = await db.select().from(places).where(eq(places.id, id));
    if (!p) throw notFound();
    await requireManager(db, p.relationshipId, userId);
    return p;
  };

  app.get<{ Params: { id: string } }>("/relationships/:id/places", async (req) => {
    await requireMember(db, req.params.id, req.user.id);
    const rows = await db.select().from(places).where(eq(places.relationshipId, req.params.id)).orderBy(asc(places.name));
    const titles = await titlesFor(req.params.id);
    return rows.map((p) => placeDto(p, titles(p.id)));
  });

  // Search goes through here, not straight from the apps, so it's counted and the service can change without an app update.
  app.get<{ Querystring: { q?: string; lat?: string; lng?: string } }>("/places/search", async (req) => {
    const q = (req.query.q ?? "").trim().slice(0, 200);
    if (q.length < 3) return [];
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const near = req.query.lat && req.query.lng && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
    await countUsage(db, "place_search", deps.now());
    try {
      return await (deps.geocode ?? photonGeocoder)(q, near);
    } catch (err) {
      req.log.warn({ err }, "place search failed");
      throw new HttpError(502, "search isn't working right now; drag the map to the spot instead");
    }
  });

  app.post<{ Params: { id: string } }>("/relationships/:id/places", async (req, reply) => {
    await requireManager(db, req.params.id, req.user.id);
    const body = placeInput.parse(req.body);
    const [row] = await db
      .insert(places)
      .values({ ...body, relationshipId: req.params.id, createdBy: req.user.id })
      .returning();
    return reply.status(201).send(placeDto(row!, []));
  });

  app.patch<{ Params: { id: string } }>("/places/:id", async (req) => {
    const existing = await loadPlace(req.params.id, req.user.id);
    const body = parsePatch(placeInput.partial(), req.body);
    const [row] = await db.update(places).set(body).where(eq(places.id, existing.id)).returning();
    return placeDto(row!, (await titlesFor(existing.relationshipId))(existing.id));
  });

  // A place a task still uses stays until the task moves elsewhere, so nobody's task quietly loses its place.
  app.delete<{ Params: { id: string } }>("/places/:id", async (req, reply) => {
    const existing = await loadPlace(req.params.id, req.user.id);
    const using = (await titlesFor(existing.relationshipId))(existing.id);
    if (using.length) throw new HttpError(409, `“${using[0]}” still uses this place`);
    await db.delete(places).where(eq(places.id, existing.id));
    return reply.status(204).send();
  });

  app.post<{ Params: { id: string } }>("/occurrences/:id/arrive", async (req) => {
    const body = arriveOccurrence.parse(req.body);
    const { occ, series } = await loadOccurrence(db, req.params.id, req.user.id);
    const updated = await db.transaction((tx) => arriveAt(tx, series, occ, req.user.id, body, deps.now()));
    // A curfew where the sub tells the Dominant: getting home is their cue.
    if (series.curfewUntil && !occ.arrivedAt && updated.arrivedAt && !updated.homeToldAt && (await reportsHome(db, series.relationshipId))) {
      const doms = await managers(db, series.relationshipId, req.user.id);
      const [dom] = doms.length === 1 ? await db.select({ name: users.displayName }).from(users).where(eq(users.id, doms[0]!)) : [];
      await notifier.send([req.user.id], {
        title: "Fealty",
        body: `You're home. Tell ${dom?.name ?? "your Dominant"}?`,
        data: { type: "curfew_arrived", relationshipId: series.relationshipId, occurrenceId: occ.id },
      });
    }
    if (updated.status === "completed" || updated.status === "submitted") {
      const submitted = updated.status === "submitted";
      await notifier.send(await managers(db, series.relationshipId, req.user.id), {
        title: "Fealty",
        body: submitted ? `${req.user.displayName} submitted a task for review` : `${req.user.displayName} completed a task`,
        data: { type: submitted ? "occurrence_submitted" : "occurrence_completed", occurrenceId: occ.id },
      });
    }
    return occurrenceDto(updated, series);
  });

  app.post<{ Params: { id: string } }>("/occurrences/:id/leave", async (req) => {
    const body = leaveOccurrence.parse(req.body ?? {});
    const { occ, series } = await loadOccurrence(db, req.params.id, req.user.id);
    const result = await db.transaction((tx) => leaveFrom(tx, series, occ, req.user.id, body, deps.now()));
    if (result.leftEarly) {
      const curfew = !!series.curfewUntil;
      await notifier.send([series.assigneeId], {
        title: "Fealty",
        body: curfew
          ? result.consequence
            ? "You left home during curfew, and a consequence was added"
            : "You left home during curfew"
          : result.consequence
            ? "You left early, and a consequence was added"
            : "You left before your time was up",
        data: { type: "occurrence_missed", occurrenceId: occ.id },
      });
      await notifier.send(await managers(db, series.relationshipId, req.user.id), {
        title: "Fealty",
        body: curfew ? `${req.user.displayName} broke curfew` : `${req.user.displayName} left “${series.title}” early`,
        data: { type: "occurrence_missed", occurrenceId: occ.id },
      });
    } else if (result.occ.status === "completed" && occ.status === "pending") {
      await notifier.send(await managers(db, series.relationshipId, req.user.id), {
        title: "Fealty",
        body: `${req.user.displayName} completed a task`,
        data: { type: "occurrence_completed", occurrenceId: occ.id },
      });
    }
    return occurrenceDto(result.occ, series);
  });

  // The Android app says whether it can notice arrivals while closed; partners see it before giving location tasks.
  app.put("/me/location", async (req, reply) => {
    const body = reportLocation.parse(req.body);
    const [before] = await db.select({ status: users.locationStatus }).from(users).where(eq(users.id, req.user.id));
    await db.update(users).set({ locationStatus: body.status, locationStatusAt: deps.now() }).where(eq(users.id, req.user.id));
    // Losing it while location tasks are set matters to whoever set them.
    if (before?.status === "ready" && body.status !== "ready") {
      const rels = await db
        .selectDistinct({ id: taskSeries.relationshipId })
        .from(taskSeries)
        .where(and(eq(taskSeries.assigneeId, req.user.id), eq(taskSeries.active, true)));
      for (const r of rels) {
        const [uses] = await db
          .select({ id: taskSeries.id })
          .from(taskSeries)
          .innerJoin(places, eq(places.id, taskSeries.placeId))
          .where(and(eq(taskSeries.relationshipId, r.id), eq(taskSeries.assigneeId, req.user.id), eq(taskSeries.active, true)))
          .limit(1);
        if (uses)
          await notifier.send(await managers(db, r.id, req.user.id), {
            title: "Fealty",
            body: `${req.user.displayName}'s phone can't check location tasks right now`,
            data: { type: "location_status", relationshipId: r.id },
          });
      }
    }
    return reply.status(204).send();
  });

  // A Dominant asks the sub to set up location; the push opens the setup screen.
  app.post<{ Params: { id: string } }>("/relationships/:id/location/ask", async (req, reply) => {
    await requireManager(db, req.params.id, req.user.id);
    const others = (await db.select({ id: memberships.userId }).from(memberships).where(eq(memberships.relationshipId, req.params.id)))
      .map((m) => m.id)
      .filter((id) => id !== req.user.id);
    await notifier.send(others, {
      title: "Fealty",
      body: `${req.user.displayName} wants to give you location tasks. Tap to set it up.`,
      data: { type: "location_setup", relationshipId: req.params.id },
    });
    return reply.status(204).send();
  });

  // Pausing stops watching every place; location tasks due meanwhile are excused, and partners are told.
  app.put<{ Params: { id: string } }>("/relationships/:id/location/pause", async (req, reply) => {
    await requireMember(db, req.params.id, req.user.id);
    const body = pauseLocation.parse(req.body);
    const until = body.until ? new Date(body.until) : null;
    if (until && until <= deps.now()) throw new HttpError(400, "pick a time in the future");
    await db
      .update(memberships)
      .set({ locationPausedAt: deps.now(), locationPausedUntil: until })
      .where(and(eq(memberships.relationshipId, req.params.id), eq(memberships.userId, req.user.id)));
    await notifier.send(await managers(db, req.params.id, req.user.id), {
      title: "Fealty",
      body: `${req.user.displayName} paused location`,
      data: { type: "location_status", relationshipId: req.params.id },
    });
    return reply.status(204).send();
  });

  app.delete<{ Params: { id: string } }>("/relationships/:id/location/pause", async (req, reply) => {
    await requireMember(db, req.params.id, req.user.id);
    await db
      .update(memberships)
      .set({ locationPausedAt: null, locationPausedUntil: null })
      .where(and(eq(memberships.relationshipId, req.params.id), eq(memberships.userId, req.user.id)));
    return reply.status(204).send();
  });
};
