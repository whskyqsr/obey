import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { Occurrence } from "../api/types";
import { useCompleteOccurrence, useEditOccurrence, useReviewOccurrence, useUndoComplete } from "../api/hooks";
import { errorMessage } from "../api/client";
import { fmtDate, fmtDateTime, fmtRelative, fmtTime, isAllDayDue, localDateOf, today } from "../lib/dates";
import { useRel } from "../lib/relationship";
import { isOpen, isOverdue } from "./OccurrenceCard";
import { RescheduleSheet } from "./RescheduleSheet";
import { StreakStrip } from "./StreakStrip";
import { Button, Icon, IconButton, cx, useSnackbar } from "./ui";

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
  const { me, memberName, features } = useRel();
  const quickComplete = useQuickComplete();
  const [rescheduling, setRescheduling] = useState(false);
  const mine = o.assigneeId === me.user.id;
  const overdue = isOverdue(o);
  const missed = o.status === "missed" || overdue;
  const done = o.status === "completed" || o.status === "excused";
  const canComplete = mine && o.status === "pending" && isOpen(o);
  const isToday = localDateOf(new Date(o.dueAt)) === today();

  const when = isAllDayDue(o.dueAt)
    ? showDate || !isToday
      ? `${fmtDate(localDateOf(new Date(o.dueAt)))}, all day`
      : "All day"
    : showDate || !isToday
      ? fmtDateTime(o.dueAt)
      : fmtTime(o.dueAt);
  const parts = [
    o.status === "missed" ? "Missed" : overdue ? "Overdue" : null,
    when,
    o.status === "pending" && !overdue ? fmtRelative(o.dueAt) : null,
    o.status === "submitted" ? "waiting for approval" : null,
    o.status === "excused" ? "excused" : null,
    !mine ? memberName(o.assigneeId) : null,
    o.rescheduled ? "moved" : null,
    o.status === "pending" && mine && !isOpen(o) ? `opens ${fmtDate(o.opensOn!, { weekday: "short" })}` : null,
  ].filter(Boolean);

  return (
    <div className="state-layer flex min-h-16 items-center gap-2 bg-surface-container-low py-1 pr-2 pl-1 has-[a[data-card-link]:focus-visible]:outline-2 has-[a[data-card-link]:focus-visible]:outline-primary">
      <div className="relative z-10">
        {canComplete ? (
          <IconButton
            icon="radio_button_unchecked"
            label={`Mark “${o.title}” done`}
            className={missed ? "text-error" : "text-on-surface-variant"}
            onClick={() => quickComplete(o)}
          />
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
        to="/tasks/$taskId"
        params={{ taskId: o.seriesId }}
        data-card-link
        className="min-w-0 flex-1 py-1 after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
      >
        <div className={cx("truncate text-body-large text-on-surface", done && "line-through opacity-70")}>{o.title}</div>
        <div className={cx("flex flex-wrap items-center gap-x-2 text-body-medium", missed ? "text-error" : "text-on-surface-variant")}>
          <StreakStrip taskId={o.seriesId} compact />
          <span className="truncate">{parts.join(" · ")}</span>
        </div>
      </Link>
      <div className="relative z-10 flex items-center gap-1">
        {actions}
        {!actions && o.status === "pending" && mine && <IconButton icon="more_time" label="More time" onClick={() => setRescheduling(true)} />}
        {features.points && o.points !== 0 && (
          <span className="min-w-9 rounded-full bg-primary-container/70 px-2 py-0.5 text-center text-label-medium text-on-primary-container tabular-nums">
            {o.points > 0 ? `+${o.points}` : o.points}
          </span>
        )}
      </div>
      <RescheduleSheet occurrence={o} open={rescheduling} onClose={() => setRescheduling(false)} />
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
  const act = (approve: boolean) => review.mutate({ id: o.id, approve }, { onSuccess: () => snack(approve ? "Approved" : "Sent back"), onError: (e) => snack(errorMessage(e)) });
  return (
    <>
      <Button variant="text" disabled={review.isPending} onClick={() => act(false)}>
        Send back
      </Button>
      <Button variant="tonal" busy={review.isPending} onClick={() => act(true)}>
        Approve
      </Button>
    </>
  );
}

/** Excuse a miss: no penalty, and it doesn't break the streak. */
export function ExcuseAction({ o }: { o: Occurrence }) {
  const { rel } = useRel();
  const snack = useSnackbar();
  const edit = useEditOccurrence(rel.id);
  return (
    <Button
      variant="text"
      busy={edit.isPending}
      onClick={() => edit.mutate({ id: o.id, change: { status: "excused" } }, { onSuccess: () => snack("Excused"), onError: (e) => snack(errorMessage(e)) })}
    >
      Excuse
    </Button>
  );
}
