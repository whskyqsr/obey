import type { Occurrence } from "../api/types";
import { useSkip, useUnskip } from "../api/hooks";
import { errorMessage } from "../api/client";
import { useRel } from "../lib/relationship";
import { useSnackbar } from "./ui";

const pastDue = (o: Occurrence) => new Date(o.dueAt).getTime() <= Date.now();

/** What skipping reads as for this due date: Skip while it's to come, Excuse once it's past due (it shows as owed). */
export function skipLabel(o: Occurrence, isDom: boolean) {
  const word = pastDue(o) ? "Excuse" : "Skip";
  return isDom ? word : `Ask to ${word.toLowerCase()}`;
}

/**
 * Skip one due date, or excuse it once it's past due (the API decides by the time). A Dominant's applies at once with
 * Undo in the snackbar; the assignee's asks a Dominant.
 */
export function useSkipOccurrence() {
  const { rel } = useRel();
  const snack = useSnackbar();
  const skip = useSkip(rel.id);
  const unskip = useUnskip(rel.id);
  return (o: Occurrence) =>
    skip.mutate(o.id, {
      onSuccess: (res) => {
        const excuse = pastDue(o);
        if (!res.applied) return snack(`Asked to ${excuse ? "excuse" : "skip"} “${o.title}”`);
        snack(`${excuse ? "Excused" : "Skipped"}: ${o.title}`, {
          label: "Undo",
          onClick: () => unskip.mutate(o.id, { onError: (e) => snack(errorMessage(e)) }),
        });
      },
      onError: (e) => snack(errorMessage(e)),
    });
}
