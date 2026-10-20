import { useMemo } from "react";
import { useOccurrences } from "../api/hooks";
import type { Occurrence } from "../api/types";
import { isOverdue } from "../components/OccurrenceCard";
import { addDays, localDateOf, today } from "./dates";
import { useRel } from "./relationship";

/**
 * What's due now for each task: anything overdue or awaiting review, today's, and otherwise the next one.
 * Uses the same window as Today so the pages share one cached query.
 */
export function useCurrentOccurrences() {
  const { rel } = useRel();
  const t = today();
  const occ = useOccurrences(rel.id, addDays(t, -30), addDays(t, 7));
  const byTask = useMemo(() => {
    const now = Date.now();
    const m = new Map<string, Occurrence[]>();
    for (const o of [...(occ.data ?? [])].sort((a, b) => a.dueAt.localeCompare(b.dueAt))) {
      const day = localDateOf(new Date(o.dueAt));
      const list = m.get(o.seriesId) ?? [];
      const hasCurrent = list.some((x) => localDateOf(new Date(x.dueAt)) >= t);
      const current =
        (isOverdue(o, now) && day < t) || o.status === "submitted" || (day === t && o.status !== "cancelled") || (day > t && o.status === "pending" && !hasCurrent);
      if (current) m.set(o.seriesId, [...list, o]);
    }
    return m;
  }, [occ.data, t]);
  return { byTask, query: occ };
}

