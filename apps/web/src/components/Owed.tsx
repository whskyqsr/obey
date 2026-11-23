import { useState } from "react";
import { useEditOccurrence } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Occurrence } from "../api/types";
import { addDays, fmtDate, fmtTime, isAllDayDue, localDateOf, today } from "../lib/dates";
import { useRel } from "../lib/relationship";
import { useTodayOccurrences } from "../lib/today";
import { useNoteAfter } from "./DecisionNote";
import { CompleteDialog, isOpen } from "./OccurrenceCard";
import { useQuickComplete } from "./TaskRow";
import { useAskWho } from "./CurfewStrip";
import { Button, Diamond, useSnackbar } from "./ui";

const OWING = new Set(["pending", "missed", "submitted"]);

/** Consequences handed to someone: what they still owe, then any excused in the last week (dimmed, for the record). */
export function useOwed(whose: string | undefined) {
  const occ = useTodayOccurrences();
  const weekAgo = addDays(today(), -7);
  const mine = (occ.data ?? []).filter((o) => o.consequence && o.assigneeId === whose).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  return {
    owed: mine.filter((o) => OWING.has(o.status)),
    excused: mine.filter((o) => o.status === "excused" && localDateOf(new Date(o.dueAt)) >= weekAgo),
  };
}

/** "due today", "due tomorrow at 9:00 PM", "missed, was due Mon, Nov 23". */
function when(o: Occurrence) {
  const d = localDateOf(new Date(o.dueAt));
  const t = today();
  const day = d === t ? "today" : d === addDays(t, 1) ? "tomorrow" : d === addDays(t, -1) ? "yesterday" : fmtDate(d);
  const at = isAllDayDue(o.dueAt) ? "" : ` at ${fmtTime(o.dueAt)}`;
  if (o.status === "submitted") return "Sent for approval";
  if (o.status === "missed") return `Not done, was due ${day}${at}`;
  return `Due ${day}${at}`;
}

/**
 * The owed list, as in the mockups: an oxblood diamond, what it is and when it's due. The person who owes it marks it
 * done; a Dominant can excuse it. Excused ones from the last week stay, dimmed.
 */
export function OwedList({ owed, excused }: { owed: Occurrence[]; excused: Occurrence[] }) {
  return (
    <div className="flex flex-col divide-y divide-outline-variant">
      {owed.map((o) => (
        <OwedRow key={o.id} o={o} />
      ))}
      {excused.map((o) => (
        <OwedRow key={o.id} o={o} />
      ))}
    </div>
  );
}

function OwedRow({ o }: { o: Occurrence }) {
  const { rel, me, isDom, memberName } = useRel();
  const snack = useSnackbar();
  const edit = useEditOccurrence(rel.id);
  const noteAfter = useNoteAfter();
  const quickComplete = useQuickComplete();
  const [completing, setCompleting] = useState(false);
  const askWho = useAskWho();
  const mine = o.assigneeId === me.user.id;
  const excused = o.status === "excused";
  const canDo = mine && o.status === "pending" && isOpen(o);
  const canExcuse = isDom && !mine && (o.status === "pending" || o.status === "missed");
  return (
    <div className="flex items-center gap-4 py-3">
      <Diamond state={excused ? "off" : o.status === "submitted" ? "waiting" : "owed"} size={16} className="mx-1" />
      <div className="min-w-0 flex-1">
        <div className={excused ? "text-body-large text-on-surface-variant" : "text-body-large text-on-surface"}>{o.title}</div>
        <div className="text-body-medium text-on-surface-variant">{excused ? (isDom ? "You excused it" : `${askWho} excused it`) : when(o)}</div>
      </div>
      {canDo && (
        <Button variant="outlined" onClick={() => (o.proofRequired || o.askMood || o.asksJournal ? setCompleting(true) : quickComplete(o))}>
          Done it
        </Button>
      )}
      {canExcuse && (
        <Button
          variant="outlined"
          disabled={edit.isPending}
          onClick={() =>
            edit.mutate(
              { id: o.id, change: { status: "excused" } },
              {
                onSuccess: () =>
                  noteAfter("Excused", {
                    relId: rel.id,
                    occurrenceId: o.id,
                    to: memberName(o.assigneeId),
                    about: `excusing “${o.title}”`,
                  }),
                onError: (e) => snack(errorMessage(e)),
              },
            )
          }
        >
          Excuse
        </Button>
      )}
      {completing && <CompleteDialog o={o} open onClose={() => setCompleting(false)} />}
    </div>
  );
}
