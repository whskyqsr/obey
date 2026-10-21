import { usePlanChanges, useSeenPlanChange } from "../api/hooks";
import { errorMessage } from "../api/client";
import { useRel } from "../lib/relationship";
import { fmtTime } from "../lib/dates";
import { eventWhen } from "./EventDialog";
import { Icon, IconButton, useSnackbar } from "./ui";

/** My plans someone else changed (a Dominant moving the end), until I close the card. */
export function PlanChanges() {
  const { rel, memberName } = useRel();
  const snack = useSnackbar();
  const changes = usePlanChanges(rel.id);
  const seen = useSeenPlanChange(rel.id);
  if (!changes.data?.length) return null;
  return (
    <div className="flex flex-col gap-3 px-4 pb-4 md:px-6">
      {changes.data.map((e) => (
        <div key={e.id} className="flex items-start gap-4 rounded-xl bg-surface-container-high px-4 py-3 text-on-surface">
          <Icon name="event" filled className="mt-0.5 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="text-title-medium">
              {e.changedBy ? memberName(e.changedBy) : "Someone"} changed {e.title}
            </div>
            <div className="text-body-medium text-on-surface-variant">
              {eventWhen(e)}
              {e.previousEndsAt && ` · was until ${fmtTime(e.previousEndsAt)}`}
            </div>
          </div>
          <IconButton icon="close" label="Got it" onClick={() => seen.mutate(e.id, { onError: (x) => snack(errorMessage(x)) })} />
        </div>
      ))}
    </div>
  );
}
