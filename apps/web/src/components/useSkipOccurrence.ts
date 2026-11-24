import type { Occurrence } from "../api/types";
import { useSkip, useUnskip } from "../api/hooks";
import { errorMessage } from "../api/client";
import { useRel } from "../lib/relationship";
import { useSnackbar } from "./ui";

/** Skip one due date. A Dominant's applies at once with Undo in the snackbar; the assignee's asks a Dominant. */
export function useSkipOccurrence() {
  const { rel } = useRel();
  const snack = useSnackbar();
  const skip = useSkip(rel.id);
  const unskip = useUnskip(rel.id);
  return (o: Occurrence) =>
    skip.mutate(o.id, {
      onSuccess: (res) =>
        res.applied
          ? snack(`Skipped: ${o.title}`, {
              label: "Undo",
              onClick: () => unskip.mutate(o.id, { onError: (e) => snack(errorMessage(e)) }),
            })
          : snack(`Asked to skip “${o.title}”`),
      onError: (e) => snack(errorMessage(e)),
    });
}
