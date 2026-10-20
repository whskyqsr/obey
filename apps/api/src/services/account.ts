import { and, eq, inArray, isNull, ne, or } from "drizzle-orm";
import type { Db, Tx } from "../db/index.js";
import { devices, invites, memberships, notes, occurrences, proofPhotos, relationships, taskSeries, users } from "../db/schema.js";

/**
 * Ends a live dynamic for everyone in it (Jake's "archive for both"): it stays readable, its schedule stops, pending
 * tasks are cancelled, open invites go, and proof photos are deleted. False when it had already ended.
 */
export async function endRelationship(tx: Tx, relationshipId: string, endedBy: string, now: Date): Promise<boolean> {
  const [rel] = await tx
    .update(relationships)
    .set({ endedAt: now, endedBy })
    .where(and(eq(relationships.id, relationshipId), isNull(relationships.endedAt)))
    .returning();
  if (!rel) return false;
  const series = tx.select({ id: taskSeries.id }).from(taskSeries).where(eq(taskSeries.relationshipId, rel.id));
  const occs = tx.select({ id: occurrences.id }).from(occurrences).where(inArray(occurrences.seriesId, series));
  await tx.delete(proofPhotos).where(inArray(proofPhotos.occurrenceId, occs));
  await tx.update(occurrences).set({ photoCount: 0 }).where(inArray(occurrences.seriesId, series));
  await tx
    .update(occurrences)
    .set({ status: "cancelled" })
    .where(and(inArray(occurrences.seriesId, series), eq(occurrences.status, "pending")));
  await tx.update(taskSeries).set({ active: false }).where(eq(taskSeries.relationshipId, rel.id));
  await tx.delete(invites).where(eq(invites.relationshipId, rel.id));
  return true;
}

/**
 * Deletes an account. A dynamic only this person is in goes entirely. One shared with others ends for everyone, and
 * the others keep their read-only copy of what was shared, now credited to "Deleted account"; this person's private
 * notes, journal and photos go. Returns who should hear that their dynamic ended.
 */
export async function deleteAccount(db: Db, userId: string, now: Date): Promise<{ ended: { relationshipId: string; others: string[] }[] }> {
  return db.transaction(async (tx) => {
    const mine = (await tx.select({ id: memberships.relationshipId }).from(memberships).where(eq(memberships.userId, userId))).map((m) => m.id);
    const ended: { relationshipId: string; others: string[] }[] = [];
    for (const relationshipId of mine) {
      const others = (
        await tx
          .select({ userId: memberships.userId })
          .from(memberships)
          .where(and(eq(memberships.relationshipId, relationshipId), ne(memberships.userId, userId)))
      ).map((m) => m.userId);
      if (!others.length) {
        await tx.delete(relationships).where(eq(relationships.id, relationshipId));
        continue;
      }
      if (await endRelationship(tx, relationshipId, userId, now)) ended.push({ relationshipId, others });
    }
    await tx.delete(notes).where(and(eq(notes.authorId, userId), or(eq(notes.visibility, "private"), eq(notes.kind, "journal"))));
    await tx.delete(proofPhotos).where(eq(proofPhotos.uploaderId, userId));
    await tx.delete(devices).where(eq(devices.userId, userId));
    // The row stays so the others' archive still has an author; nothing in it identifies the person, and the new
    // auth uid can never match a sign-in, so signing up again starts a fresh account.
    await tx
      .update(users)
      .set({
        authUid: `deleted:${userId}`,
        displayName: "Deleted account",
        email: null,
        avatar: null,
        avatarType: null,
        avatarUpdatedAt: null,
        quietStart: null,
        quietEnd: null,
        timezone: null,
        mutedNotifications: [],
      })
      .where(eq(users.id, userId));
    return { ended };
  });
}
