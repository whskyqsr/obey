import type { Occurrence } from "../api/types";
import { useOccurrences, usePendingReschedules } from "../api/hooks";
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

/** What a Dominant has to decide: extension requests, completions to approve and fresh misses (today and yesterday). */
export function useNeedsYou() {
  const { rel, isDom } = useRel();
  const occ = useTodayOccurrences();
  const pending = usePendingReschedules(rel.id);
  const t = today();
  const list = occ.data ?? [];
  const review = list.filter((o) => o.status === "submitted").sort(byDue);
  const missed = list.filter((o) => o.status === "missed" && dueDay(o) >= addDays(t, -1)).sort(byDue);
  const requests = new Set((pending.data ?? []).map((r) => r.groupId ?? r.id)).size;
  return { review, missed, count: isDom ? requests + review.length + missed.length : 0 };
}

