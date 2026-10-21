import { MOODS, MOOD_LABELS } from "./Mood";
import { createContext, useContext, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { Occurrence } from "../api/types";
import { useCompleteOccurrence, useConfirmMiss, useDropConsequence, useEditOccurrence, useReviewOccurrence, useUndoComplete } from "../api/hooks";
import { errorMessage } from "../api/client";
import { fmtDate, fmtDateTime, fmtRelative, fmtTime, isAllDayDue, localDateOf, today } from "../lib/dates";
import { useRel } from "../lib/relationship";
import { CompleteDialog, isOpen, isOverdue, opensLabel } from "./OccurrenceCard";
import { RitualDialog, isRitual, stepProgress } from "./Ritual";
import { SendBackDialog } from "./Comments";
import { RescheduleSheet } from "./RescheduleSheet";
import { StreakStrip } from "./StreakStrip";
import { useNoteAfter } from "./DecisionNote";
import { CountRing, CountSheet, canCount, countLine, isCounted, useCountTap } from "./Count";
import { CheckInButton, PlaceRing, canCheckIn, isPlaced, placeLine, useCheckIn, usePlaceLookup } from "./Location";
import { Button, Icon, IconButton, cx, useSnackbar } from "./ui";

/** Where a row opens its task. Today's wide layout points it at the side panel instead of the task page. */
export const RowLink = createContext<((taskId: string) => { to: string; params?: Record<string, string>; search?: Record<string, string>; current?: boolean }) | null>(null);

/** One-tap Done with Undo in the snackbar, shared by rows and the keyboard shortcut. */
export function useQuickComplete() {
  const { rel } = useRel();
  const snack = useSnackbar();
  const complete = useCompleteOccurrence(rel.id);
  const undo = useUndoComplete(rel.id);
  return (o: Occurrence) =>
    complete.mutate(
      { id: o.id },
      {
        onSuccess: (res) =>
          snack(`${res?.status === "submitted" ? "Sent for approval" : "Done"}: ${o.title}`, {
            label: "Undo",
            onClick: () => undo.mutate(o.id, { onError: (e) => snack(errorMessage(e)) }),
          }),
        onError: (e) => snack(errorMessage(e)),
      },
    );
}

/**
 * A dense task row: a leading check (tap to complete when it's yours and open), the title and when, and
 * trailing actions. The whole row opens the task.
 */
export function TaskRow({ o, showDate, actions }: { o: Occurrence; showDate?: boolean; actions?: ReactNode }) {
  const { me, isDom, memberName, features } = useRel();
  const quickComplete = useQuickComplete();
  const countTap = useCountTap();
  const { checkIn } = useCheckIn();
  const placeOf = usePlaceLookup();
  const [rescheduling, setRescheduling] = useState(false);
  const [counting, setCounting] = useState(false);
  // A task that needs proof opens the Done sheet instead of completing in one tap.
  const [completing, setCompleting] = useState(false);
  const [running, setRunning] = useState(false);
  const mine = o.assigneeId === me.user.id;
  // Someone still staying at a place past the deadline got there in time.
  const overdue = isOverdue(o) && !o.arrivedAt;
  const missed = o.status === "missed" || overdue;
  const done = o.status === "completed" || o.status === "excused";
  const canComplete = mine && o.status === "pending" && isOpen(o);
  const isToday = localDateOf(new Date(o.dueAt)) === today();
  const { current, ...link } = useContext(RowLink)?.(o.seriesId) ?? { to: "/tasks/$taskId", params: { taskId: o.seriesId } };

  const when = isAllDayDue(o.dueAt)
    ? showDate || !isToday
      ? `${fmtDate(localDateOf(new Date(o.dueAt)))}, all day`
      : "All day"
    : showDate || !isToday
      ? fmtDateTime(o.dueAt)
      : fmtTime(o.dueAt);
  const counted = isCounted(o);
  const countable = counted && canCount(o, mine, isDom);
  const placed = isPlaced(o);
  const checkable = placed && canCheckIn(o, mine);
  const parts = [
    counted ? countLine(o) : null,
    placed ? placeLine(o, placeOf(o.placeId)) : null,
    o.status === "missed" && !counted && !o.leftAt ? "Missed" : overdue ? "Overdue" : null,
    o.arrivedAt && o.status === "pending" ? null : when,
    o.status === "pending" && !overdue && !o.arrivedAt ? fmtRelative(o.dueAt) : null,
    o.status === "submitted" ? "waiting for approval" : null,
    o.status === "excused" ? "excused" : null,
    !mine ? memberName(o.assigneeId) : null,
    o.rescheduled ? "moved" : null,
    o.status === "pending" && mine && !isOpen(o) ? opensLabel(o) : null,
    o.status === "pending" && isRitual(o) && o.stepsDone.length ? stepProgress(o) : null,
  ].filter(Boolean);

  return (
    <div
      data-row
      className={cx(
        "state-layer flex min-h-16 items-center gap-2 py-1 pr-2 pl-1 has-[a[data-card-link]:focus-visible]:outline-2 has-[a[data-card-link]:focus-visible]:-outline-offset-2 has-[a[data-card-link]:focus-visible]:outline-primary",
        current ? "bg-secondary-container" : "bg-surface-container-low",
      )}
    >
      <div className="relative z-10">
        {placed && o.status !== "completed" && o.status !== "excused" && o.status !== "submitted" ? (
          <PlaceRing o={o} onTap={checkable ? () => checkIn(o) : undefined} />
        ) : counted ? (
          <CountRing o={o} onTap={countable && mine ? () => countTap(o) : undefined} onHold={countable ? () => setCounting(true) : undefined} disabled={!countable} />
        ) : canComplete ? (
          isRitual(o) ? (
            <IconButton icon="play_circle" label={`Start “${o.title}”`} data-action="done" className={missed ? "text-error" : "text-primary"} onClick={() => setRunning(true)} />
          ) : (
            <IconButton
              icon="radio_button_unchecked"
              label={`Mark “${o.title}” done`}
              data-action="done"
              className={missed ? "text-error" : "text-on-surface-variant"}
              onClick={() => (o.proofRequired || o.askMood || o.asksJournal ? setCompleting(true) : quickComplete(o))}
            />
          )
        ) : (
          <span className="flex size-10 items-center justify-center">
            <Icon
              name={
                o.status === "completed"
                  ? "check_circle"
                  : o.status === "submitted"
                    ? "hourglass_top"
                    : o.status === "excused"
                      ? "remove_circle_outline"
                      : missed
                        ? "error"
                        : "radio_button_unchecked"
              }
              filled={o.status === "completed"}
              className={o.status === "completed" ? "text-primary" : o.status === "submitted" ? "text-tertiary" : missed ? "text-error" : "text-outline"}
            />
          </span>
        )}
      </div>
      <Link
        {...(link as { to: "/tasks/$taskId"; params: { taskId: string } })}
        data-card-link
        data-task-row
        className="min-w-0 flex-1 py-1 after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
      >
        <div className={cx("truncate text-body-large text-on-surface", done && !counted && "line-through opacity-70")}>{o.title}</div>
        <div className={cx("flex flex-wrap items-center gap-x-2 text-body-medium", missed ? "text-error" : "text-on-surface-variant")}>
          <StreakStrip taskId={o.seriesId} compact />
          <span className="truncate">{parts.join(" · ")}</span>
          {o.mood && (
            <span className="inline-flex items-center gap-0.5" aria-label={`Felt ${MOOD_LABELS[o.mood - 1]!.toLowerCase()}`}>
              <Icon name={MOODS[o.mood - 1]!} size={16} />
              {MOOD_LABELS[o.mood - 1]}
            </span>
          )}
          {o.commentCount > 0 && (
            <span className="inline-flex items-center gap-0.5" aria-label={`${o.commentCount} comment${o.commentCount === 1 ? "" : "s"}`}>
              <Icon name="chat_bubble" size={14} />
              {o.commentCount}
            </span>
          )}
        </div>
      </Link>
      <div className={"relative z-10 flex items-center gap-1"}>
        {actions}
        {checkable && <CheckInButton o={o} className="max-md:hidden" />}
        {/* A Dominant moves anyone's deadline as easily as a sub asks for more time on their own. */}
        {!actions && o.status === "pending" && (mine || isDom) && (
          <IconButton icon="more_time" label={mine ? "More time" : "Reschedule"} data-action="more" onClick={() => setRescheduling(true)} />
        )}
        {features.points && o.points !== 0 && (
          <span className="min-w-9 rounded-full bg-primary-container/70 px-2 py-0.5 text-center text-label-medium text-on-primary-container tabular-nums">
            {o.points > 0 ? `+${o.points}` : o.points}
            {counted && o.countPer === "count" ? " each" : ""}
          </span>
        )}
      </div>
      <RescheduleSheet occurrence={o} open={rescheduling} onClose={() => setRescheduling(false)} />
      {completing && <CompleteDialog o={o} open onClose={() => setCompleting(false)} />}
      {running && <RitualDialog o={o} open onClose={() => setRunning(false)} />}
      {counting && <CountSheet o={o} open onClose={() => setCounting(false)} />}
    </div>
  );
}

/** Rows stacked into one rounded group. */
export function RowGroup({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-0.5 overflow-hidden rounded-lg">{children}</div>;
}

/** Approve / Send back for a submitted completion, decided in place. */
export function ReviewActions({ o }: { o: Occurrence }) {
  const { rel } = useRel();
  const snack = useSnackbar();
  const review = useReviewOccurrence(rel.id);
  const [sendingBack, setSendingBack] = useState(false);
  const act = (approve: boolean) => review.mutate({ id: o.id, approve }, { onSuccess: () => snack(approve ? "Approved" : "Sent back"), onError: (e) => snack(errorMessage(e)) });
  return (
    <>
      <Button variant="text" disabled={review.isPending} onClick={() => setSendingBack(true)}>
        Send back
      </Button>
      <SendBackDialog o={o} open={sendingBack} onClose={() => setSendingBack(false)} />
      <Button variant="tonal" busy={review.isPending} onClick={() => act(true)}>
        Approve
      </Button>
    </>
  );
}

/**
 * Decide a miss: excuse it (no penalty, streak intact), leave it missed, which keeps the penalty, or keep the miss and drop
 * the consequence it handed out. Each clears it from Needs you.
 */
export function MissActions({ o }: { o: Occurrence }) {
  const { rel, memberName } = useRel();
  const snack = useSnackbar();
  const edit = useEditOccurrence(rel.id);
  const confirm = useConfirmMiss(rel.id);
  const drop = useDropConsequence(rel.id);
  const noteAfter = useNoteAfter();
  const target = (about: string) => ({ relId: rel.id, occurrenceId: o.id, to: memberName(o.assigneeId), about: `${about} “${o.title}”` });
  const busy = edit.isPending || confirm.isPending || drop.isPending;
  return (
    <>
      <IconButton
        icon="remove_circle_outline"
        label="Excuse: no penalty"
        disabled={busy}
        onClick={() =>
          edit.mutate({ id: o.id, change: { status: "excused" } }, { onSuccess: () => noteAfter("Excused", target("excusing")), onError: (e) => snack(errorMessage(e)) })
        }
      />
      {o.missConsequence && (
        <IconButton
          icon="remove_done"
          label={`Drop “${o.missConsequence}”: it stays missed`}
          disabled={busy}
          onClick={() =>
            drop.mutate(o.id, {
              onSuccess: () => noteAfter(`Dropped “${o.missConsequence}”`, target(`dropping “${o.missConsequence}” for`)),
              onError: (e) => snack(errorMessage(e)),
            })
          }
        />
      )}
      <IconButton
        icon="check"
        label="Accept: it stays missed"
        variant="tonal"
        disabled={busy}
        onClick={() => confirm.mutate(o.id, { onSuccess: () => noteAfter("Kept as missed", target("keeping as missed")), onError: (e) => snack(errorMessage(e)) })}
      />
    </>
  );
}
