import {
  type ChastityLock,
  type ChastityView,
  allFeatures,
  chastityAskInput,
  chastityDecideInput,
  chastityLockInput,
  chastityPhotoAskInput,
  chastityTimeInput,
  id,
} from "@obey/contracts";
import { localDate, localTime } from "@obey/recurrence";
import { and, desc, eq, inArray, lte } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Deps } from "../app.js";
import { chastityEvents, chastityLocks, memberships, relationships, taskSeries } from "../db/schema.js";
import { HttpError, forbidden, notFound } from "../errors.js";
import { canManage, requireMember } from "../services/access.js";
import { type Lock, OPEN, canSeeKeybox, changeLockTime, endLock, eventDto, expiredLocks, lockDto, openLock, overdueBreaks, redCallOpen } from "../services/chastity.js";
import { materializeSeries } from "../services/scheduling.js";

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_PHOTO_BYTES = 4_000_000;
const BREAK_MINUTES = 20;
const fmtLength = (m: number) => {
  const abs = Math.abs(m);
  if (abs % 1440 === 0) return `${abs / 1440} day${abs === 1440 ? "" : "s"}`;
  if (abs % 60 === 0) return `${abs / 60} hour${abs === 60 ? "" : "s"}`;
  return `${abs} minutes`;
};

/**
 * Chastity, an optional module (off unless a dynamic switches it on). A Dominant, the keyholder, asks to lock someone;
 * it starts when they lock up, sealing a photo of the keybox code (set without looking) when there's a keybox. The
 * keyholder sees that photo any time; the wearer once released, or at once on a Red safe call. The wearer asks for
 * release or a hygiene break; the keyholder adds or takes off time, asks for a photo (a task with photo proof), or
 * releases them. Consequences and rewards can carry lock time too (see services/chastity).
 */
export const chastityRoutes = (deps: Deps) => async (app: FastifyInstance) => {
  const { db, notifier } = deps;

  app.addContentTypeParser(PHOTO_TYPES, { parseAs: "buffer", bodyLimit: MAX_PHOTO_BYTES }, (_req, body, done) => done(null, body));

  async function requireOn(relationshipId: string) {
    const [rel] = await db.select({ features: relationships.features }).from(relationships).where(eq(relationships.id, relationshipId));
    if (!allFeatures(rel!.features).chastity) throw forbidden("chastity is switched off for this dynamic");
  }

  /** The lock, if the caller is in its dynamic. */
  async function loadLock(lockId: string, userId: string) {
    if (!id.safeParse(lockId).success) throw notFound("no such lock");
    const [lock] = await db.select().from(chastityLocks).where(eq(chastityLocks.id, lockId));
    if (!lock) throw notFound("no such lock");
    await requireMember(db, lock.relationshipId, userId);
    return lock;
  }
  const keyholderOnly = (lock: Lock, userId: string) => {
    if (lock.keyholderId !== userId) throw forbidden("only the keyholder can do this");
  };
  const dto = async (lock: Lock, viewerId: string): Promise<ChastityLock> => lockDto(lock, viewerId, await redCallOpen(db, lock.relationshipId));
  const reread = async (lockId: string) => (await db.select().from(chastityLocks).where(eq(chastityLocks.id, lockId)))[0]!;
  const keyboxPhoto = (req: { headers: Record<string, unknown>; body: unknown }) => {
    const type = String(req.headers["content-type"] ?? "")
      .split(";")[0]!
      .trim();
    if (!PHOTO_TYPES.includes(type) || !Buffer.isBuffer(req.body) || req.body.length === 0) throw new HttpError(415, "send a photo of the keybox code");
    return { keybox: req.body as Buffer, keyboxType: type };
  };

  app.get<{ Params: { id: string } }>("/relationships/:id/chastity", async (req): Promise<ChastityView> => {
    const relationshipId = req.params.id;
    await requireMember(db, relationshipId, req.user.id);
    await requireOn(relationshipId);
    const red = await redCallOpen(db, relationshipId);
    const locks = await db.select().from(chastityLocks).where(eq(chastityLocks.relationshipId, relationshipId)).orderBy(desc(chastityLocks.createdAt)).limit(40);
    const open = locks.filter((l) => (OPEN as readonly string[]).includes(l.status));
    const past = locks.filter((l) => l.status === "ended");
    const byLock = new Map(open.map((l) => [l.id, l]));
    const events = open.length
      ? await db
          .select()
          .from(chastityEvents)
          .where(
            inArray(
              chastityEvents.lockId,
              open.map((l) => l.id),
            ),
          )
          .orderBy(desc(chastityEvents.createdAt))
      : [];
    return {
      open: open.map((l) => lockDto(l, req.user.id, red)),
      events: events.map((e) => eventDto(e, byLock.get(e.lockId)!, req.user.id)),
      past: past.map((l) => lockDto(l, req.user.id, red)),
    };
  });

  /** A Dominant asks to lock someone. Nothing runs until they lock up. */
  app.post<{ Params: { id: string } }>("/relationships/:id/chastity", async (req, reply): Promise<ChastityLock> => {
    const relationshipId = req.params.id;
    const me = await requireMember(db, relationshipId, req.user.id);
    if (!canManage(me.role)) throw forbidden("only a Dominant can be the keyholder");
    await requireOn(relationshipId);
    const body = chastityLockInput.parse(req.body ?? {});
    const others = (await db.select().from(memberships).where(eq(memberships.relationshipId, relationshipId))).filter((m) => m.userId !== req.user.id && m.role !== "dominant");
    const wearer = body.wearerId ? others.find((m) => m.userId === body.wearerId) : others.length === 1 ? others[0] : undefined;
    if (!wearer) throw new HttpError(400, others.length ? "say who to lock" : "there's nobody here to lock");
    if (await openLock(db, relationshipId, wearer.userId)) throw new HttpError(409, "they're already locked, or asked to lock up");
    const [lock] = await db
      .insert(chastityLocks)
      .values({
        relationshipId,
        wearerId: wearer.userId,
        keyholderId: req.user.id,
        status: "pending",
        keyMode: body.keyMode,
        minutes: body.minutes,
        hideTime: body.hideTime,
        createdAt: deps.now(),
      })
      .returning();
    const length = body.minutes && !body.hideTime ? ` for ${fmtLength(body.minutes)}` : "";
    await notifier.send([wearer.userId], { title: "Fealty", body: `${req.user.displayName} wants you locked${length}`, data: { type: "chastity", relationshipId } });
    reply.status(201);
    return dto(lock!, req.user.id);
  });

  /**
   * The wearer locks up: to start the lock, or to relock after a break. With a keybox, the body is the photo of the
   * new code, and it replaces the one sealed before.
   */
  app.post<{ Params: { id: string } }>("/chastity/:id/lock", async (req): Promise<ChastityLock> => {
    const lock = await loadLock(req.params.id, req.user.id);
    if (lock.wearerId !== req.user.id) throw forbidden("only the person being locked can lock up");
    if (lock.status !== "pending" && lock.status !== "break") throw new HttpError(409, lock.status === "active" ? "you're already locked" : "this lock is over");
    const photo = lock.keyMode === "keybox" ? keyboxPhoto(req) : {};
    const now = deps.now();
    const updated = await db.transaction(async (tx) => {
      if (lock.status === "pending") {
        const endsAt = lock.minutes ? new Date(now.getTime() + lock.minutes * 60_000) : null;
        const [l] = await tx
          .update(chastityLocks)
          .set({ ...photo, status: "active", startedAt: now, endsAt })
          .where(and(eq(chastityLocks.id, lock.id), eq(chastityLocks.status, "pending")))
          .returning();
        if (!l) throw new HttpError(409, "this lock changed; try again");
        await tx.insert(chastityEvents).values({ lockId: lock.id, kind: "started", minutes: lock.minutes, byId: req.user.id, createdAt: now });
        return l;
      }
      const [l] = await tx
        .update(chastityLocks)
        .set({ ...photo, status: "active", breakEndsAt: null })
        .where(and(eq(chastityLocks.id, lock.id), eq(chastityLocks.status, "break")))
        .returning();
      if (!l) throw new HttpError(409, "this lock changed; try again");
      await tx
        .update(chastityEvents)
        .set({ status: "done" })
        .where(and(eq(chastityEvents.lockId, lock.id), eq(chastityEvents.kind, "break"), inArray(chastityEvents.status, ["approved", "overdue"])));
      await tx.insert(chastityEvents).values({ lockId: lock.id, kind: "relocked", byId: req.user.id, createdAt: now, note: lock.keyMode === "keybox" ? "New code sealed" : null });
      return l;
    });
    await notifier.send([lock.keyholderId], {
      title: "Fealty",
      body: lock.status === "pending" ? `${req.user.displayName} is locked` : `${req.user.displayName} relocked`,
      data: { type: "chastity", relationshipId: lock.relationshipId },
    });
    return dto(updated, req.user.id);
  });

  /** Declines or takes back an ask to lock up, or (the keyholder) releases a running lock. */
  app.delete<{ Params: { id: string } }>("/chastity/:id", async (req, reply) => {
    const lock = await loadLock(req.params.id, req.user.id);
    const now = deps.now();
    if (lock.status === "pending") {
      if (lock.wearerId !== req.user.id && lock.keyholderId !== req.user.id) throw forbidden();
      const declined = lock.wearerId === req.user.id;
      await db
        .update(chastityLocks)
        .set({ status: declined ? "declined" : "cancelled", endedAt: now, endedBy: req.user.id })
        .where(eq(chastityLocks.id, lock.id));
      if (declined) await notifier.send([lock.keyholderId], { title: "Fealty", body: `${req.user.displayName} said not now to locking up`, data: { type: "chastity", relationshipId: lock.relationshipId } });
    } else if (lock.status === "active" || lock.status === "break") {
      keyholderOnly(lock, req.user.id);
      await db.transaction((tx) => endLock(tx, lock, req.user.id, "released", now));
      await notifier.send([lock.wearerId], { title: "Fealty", body: `${req.user.displayName} released you`, data: { type: "chastity", relationshipId: lock.relationshipId } });
    } else throw new HttpError(409, "this lock is already over");
    reply.status(204);
  });

  app.post<{ Params: { id: string } }>("/chastity/:id/time", async (req): Promise<ChastityLock> => {
    const lock = await loadLock(req.params.id, req.user.id);
    keyholderOnly(lock, req.user.id);
    const body = chastityTimeInput.parse(req.body);
    if (lock.status !== "active" && lock.status !== "break") throw new HttpError(409, "the lock isn't running");
    if (!lock.endsAt) throw new HttpError(409, "an open-ended lock has no end to move");
    const e = await db.transaction((tx) => changeLockTime(tx, lock, body.minutes, { note: body.note || null, byId: req.user.id }, deps.now()));
    if (!e) throw new HttpError(409, "the lock isn't running");
    const what = lock.hideTime ? (body.minutes > 0 ? "added time to your lock" : "took time off your lock") : body.minutes > 0 ? `added ${fmtLength(body.minutes)} to your lock` : `took ${fmtLength(body.minutes)} off your lock`;
    await notifier.send([lock.wearerId], { title: "Fealty", body: `${req.user.displayName} ${what}`, data: { type: "chastity", relationshipId: lock.relationshipId } });
    return dto(await reread(lock.id), req.user.id);
  });

  /** The wearer asks to be released, or for a hygiene break. One open ask of each kind at a time. */
  app.post<{ Params: { id: string } }>("/chastity/:id/asks", async (req, reply) => {
    const lock = await loadLock(req.params.id, req.user.id);
    if (lock.wearerId !== req.user.id) throw forbidden("only the person locked can ask");
    if (lock.status !== "active") throw new HttpError(409, lock.status === "break" ? "relock first" : "the lock isn't running");
    const body = chastityAskInput.parse(req.body);
    const kind = body.kind === "release" ? "release_ask" : "break";
    const [pending] = await db
      .select({ id: chastityEvents.id })
      .from(chastityEvents)
      .where(and(eq(chastityEvents.lockId, lock.id), eq(chastityEvents.kind, kind), eq(chastityEvents.status, "pending")));
    if (pending) throw new HttpError(409, "you've already asked");
    const [e] = await db
      .insert(chastityEvents)
      .values({
        lockId: lock.id,
        kind,
        status: "pending",
        minutes: body.kind === "break" ? (body.minutes ?? BREAK_MINUTES) : null,
        note: body.note || null,
        byId: req.user.id,
        createdAt: deps.now(),
      })
      .returning();
    await notifier.send([lock.keyholderId], {
      title: "Fealty",
      body: body.kind === "release" ? `${req.user.displayName} asked to be released` : `${req.user.displayName} asked for a hygiene break`,
      data: { type: "chastity", relationshipId: lock.relationshipId },
    });
    reply.status(201);
    return eventDto(e!, lock, req.user.id);
  });

  /** The keyholder answers an ask. Releasing ends the lock; a break unlocks them until they relock. */
  app.post<{ Params: { id: string } }>("/chastity/asks/:id/decide", async (req): Promise<ChastityLock> => {
    if (!id.safeParse(req.params.id).success) throw notFound();
    const [ask] = await db.select().from(chastityEvents).where(eq(chastityEvents.id, req.params.id));
    if (!ask || (ask.kind !== "release_ask" && ask.kind !== "break")) throw notFound();
    const lock = await loadLock(ask.lockId, req.user.id);
    keyholderOnly(lock, req.user.id);
    if (ask.status !== "pending") throw new HttpError(409, "this was already answered");
    const body = chastityDecideInput.parse(req.body);
    const now = deps.now();
    const minutes = ask.kind === "break" ? (body.minutes ?? ask.minutes ?? BREAK_MINUTES) : null;
    await db.transaction(async (tx) => {
      const [answered] = await tx
        .update(chastityEvents)
        .set({ status: body.approve ? "approved" : "declined", decidedAt: now, minutes, note: body.note || ask.note })
        .where(and(eq(chastityEvents.id, ask.id), eq(chastityEvents.status, "pending")))
        .returning();
      if (!answered) throw new HttpError(409, "this was already answered");
      if (!body.approve) return;
      if (lock.status !== "active") throw new HttpError(409, "the lock isn't running");
      if (ask.kind === "release_ask") await endLock(tx, lock, req.user.id, "released", now);
      else await tx.update(chastityLocks).set({ status: "break", breakEndsAt: new Date(now.getTime() + minutes! * 60_000) }).where(eq(chastityLocks.id, lock.id));
    });
    const said = body.approve ? (ask.kind === "release_ask" ? "released you" : `allowed a ${minutes}-minute break`) : ask.kind === "release_ask" ? "said not yet to release" : "said no to a break";
    await notifier.send([lock.wearerId], { title: "Fealty", body: `${req.user.displayName} ${said}`, data: { type: "chastity", relationshipId: lock.relationshipId } });
    return dto(await reread(lock.id), req.user.id);
  });

  /** The keyholder asks for a photo: a one-off task with photo proof and approval, so it's reviewed and missed like any task. */
  app.post<{ Params: { id: string } }>("/chastity/:id/photo-ask", async (req, reply) => {
    const lock = await loadLock(req.params.id, req.user.id);
    keyholderOnly(lock, req.user.id);
    if (lock.status !== "active") throw new HttpError(409, "they need to be locked");
    const body = chastityPhotoAskInput.parse(req.body);
    const due = new Date(body.dueAt);
    const now = deps.now();
    if (due <= now) throw new HttpError(400, "pick a time that hasn't passed");
    let date: string, dueTime: string;
    try {
      date = localDate(due, body.timezone);
      dueTime = localTime(due, body.timezone);
    } catch {
      throw new HttpError(400, `unknown timezone ${body.timezone}`);
    }
    const series = await db.transaction(async (tx) => {
      const [s] = await tx
        .insert(taskSeries)
        .values({
          relationshipId: lock.relationshipId,
          assigneeId: lock.wearerId,
          title: "Show you're still locked",
          bodyMd: "Take a photo that shows you're still locked.",
          proofRequired: true,
          approvalRequired: true,
          schedule: { start: date },
          dueTime,
          timezone: body.timezone,
          createdBy: req.user.id,
        })
        .returning();
      await materializeSeries(tx, s!, date, now);
      await tx.insert(chastityEvents).values({ lockId: lock.id, kind: "photo_ask", byId: req.user.id, createdAt: now, taskId: s!.id });
      return s!;
    });
    await notifier.send([lock.wearerId], { title: "Fealty", body: `${req.user.displayName} asked for a photo`, data: { type: "task_assigned", taskId: series.id } });
    reply.status(201);
    return { taskId: series.id };
  });

  /** The sealed photo of the keybox code. */
  app.get<{ Params: { id: string } }>("/chastity/:id/keybox", async (req, reply) => {
    const lock = await loadLock(req.params.id, req.user.id);
    if (!lock.keybox) throw notFound("no keybox photo");
    if (!canSeeKeybox(lock, req.user.id, await redCallOpen(db, lock.relationshipId))) throw forbidden("the code stays sealed until you're released");
    return reply.header("content-type", lock.keyboxType ?? "image/jpeg").header("cache-control", "private, no-store").send(lock.keybox);
  });
};

/** Locks that ran out, ended, with everyone told. Runs from jobs. */
export async function finishLocks(deps: Pick<Deps, "db" | "notifier">, now: Date) {
  const { db, notifier } = deps;
  for (const lock of await expiredLocks(db, now)) {
    const ended = await db.transaction((tx) => endLock(tx, lock, null, "time", now));
    if (!ended) continue;
    const data = { type: "chastity", relationshipId: lock.relationshipId };
    await notifier.send([lock.wearerId], { title: "Fealty", body: lock.keyMode === "keybox" ? "Your lock is over. The keybox code is yours." : "Your lock is over", data });
    await notifier.send([lock.keyholderId], { title: "Fealty", body: "A lock you hold is over", data });
  }
  for (const lock of await db.transaction((tx) => overdueBreaks(tx, now)))
    await notifier.send([lock.keyholderId], { title: "Fealty", body: "A hygiene break is over, and they haven't relocked", data: { type: "chastity", relationshipId: lock.relationshipId } });
  // Asks to lock up that nobody answered within a week lapse.
  await db
    .update(chastityLocks)
    .set({ status: "cancelled", endedAt: now })
    .where(and(eq(chastityLocks.status, "pending"), lte(chastityLocks.createdAt, new Date(now.getTime() - 7 * 86_400_000))));
}
