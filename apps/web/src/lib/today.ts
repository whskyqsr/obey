import type { Occurrence } from "../api/types";
import { useLedger, useOccurrences, usePendingReschedules } from "../api/hooks";
import { addDays, localDateOf, today } from "./dates";
import { useRel } from "./relationship";

const byDue = (a: Occurrence, b: Occurrence) => a.dueAt.localeCompare(b.dueAt);
const dueDay = (o: Occurrence) => localDateOf(new Date(o.dueAt));

/** Today's occurrences window, shared with the nav badge so both read one query. */
export function useTodayOccurrences() {
  const { rel } = useRel();
  const t = today();
  return useOccurrences(rel.id, addDays(t, -30), addDays(t, 7));
}

/** A check-in at or below this asks a Dominant's attention. */
export const LOW_MOOD = 2;

/**
 * What a Dominant has to decide or answer: extension requests, completions to approve, fresh misses (today and
 * yesterday) not yet excused or left as missed, low check-ins (the last two days) not yet answered, and rewards spent
 * but not yet marked redeemed.
 */
export function useNeedsYou() {
  const { rel, isDom, me, features } = useRel();
  const occ = useTodayOccurrences();
  const pending = usePendingReschedules(rel.id);
  const ledger = useLedger(rel.id, isDom && features.points);
  const t = today();
  const list = occ.data ?? [];
  const review = list.filter((o) => o.status === "submitted").sort(byDue);
  const missed = list.filter((o) => o.status === "missed" && !o.missConfirmed && dueDay(o) >= addDays(t, -1)).sort(byDue);
  const lowMoods = list
    .filter((o) => o.mood !== null && o.mood <= LOW_MOOD && !o.moodSeen && o.assigneeId !== me.user.id && o.completedAt && localDateOf(new Date(o.completedAt)) >= addDays(t, -1))
    .sort((a, b) => b.completedAt!.localeCompare(a.completedAt!));
  const redemptions = (ledger.data ?? []).filter((e) => e.kind === "redemption" && !e.redeemedAt && e.userId !== me.user.id);
  const requests = new Set((pending.data ?? []).map((r) => r.groupId ?? r.id)).size;
  return { review, missed, lowMoods, redemptions, count: isDom ? requests + review.length + missed.length + lowMoods.length + redemptions.length : 0 };
}

