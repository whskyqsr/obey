import { useState } from "react";
import { Link } from "@tanstack/react-router";
import type { Occurrence, OccurrenceStatus } from "@obey/contracts";
import { useCompleteOccurrence, useReviewOccurrence } from "../api/hooks";
import { errorMessage } from "../api/client";
import { fmtDate, fmtDateTime, fmtRelative, fmtTime, localDateOf, today } from "../lib/dates";
import { useRel } from "../lib/relationship";
import { RescheduleSheet } from "./RescheduleSheet";
import { Badge, Button, Dialog, IconButton, TextArea, cx, useSnackbar } from "./ui";

const STATUS: Record<OccurrenceStatus, { label: string; tone: "primary" | "error" | "tertiary" | "neutral" }> = {
  pending: { label: "To do", tone: "neutral" },
  submitted: { label: "Awaiting review", tone: "tertiary" },
  completed: { label: "Done", tone: "primary" },
  missed: { label: "Missed", tone: "error" },
  excused: { label: "Excused", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export function isOverdue(o: Occurrence, now = Date.now()) {
  return o.status === "pending" && new Date(o.dueAt).getTime() < now;
}

/** One due date of a task. Its title opens the task, except on the task's own page. */
export function OccurrenceCard({ o, showDate, linkTask = true }: { o: Occurrence; showDate?: boolean; linkTask?: boolean }) {
  const { rel, me, isDom, memberName, features } = useRel();
  const snack = useSnackbar();
  const review = useReviewOccurrence(rel.id);
  const [completing, setCompleting] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);

  const mine = o.assigneeId === me.user.id;
  const overdue = isOverdue(o);
  const done = o.status === "completed" || o.status === "excused" || o.status === "cancelled";
  const isToday = localDateOf(new Date(o.dueAt)) === today();
  const due = new Date(o.dueAt);
  const allDay = due.getHours() === 23 && due.getMinutes() === 59 && due.getSeconds() === 59;
  const status = STATUS[o.status];

  return (
    <div
      className={cx(
        "flex flex-col gap-3 rounded-md p-4",
        overdue ? "bg-error-container/60" : "bg-surface-container-low",
        done && "opacity-70",
      )}
    >
      <div className="flex items-start gap-3">
        {/* Not a nested interactive: the actions below sit outside this link. */}
        <TitleWrap linkTask={linkTask} taskId={o.seriesId}>
          <div className={cx("text-title-medium text-on-surface", done && "line-through")}>{o.title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-body-medium text-on-surface-variant">
            <span>
              {/* All-day tasks are due at 23:59:59 local; show "All day" rather than 11:59 PM. */}
              {allDay
                ? showDate || !isToday
                  ? `${fmtDate(o.dueAt)}, all day`
                  : "All day"
                : showDate || !isToday
                  ? fmtDateTime(o.dueAt)
                  : fmtTime(o.dueAt)}
            </span>
            {o.status === "pending" && <span className={overdue ? "text-error" : ""}>· {fmtRelative(o.dueAt)}</span>}
            {!mine && <span>· {memberName(o.assigneeId)}</span>}
            {o.rescheduled && <span title="Rescheduled">· moved</span>}
          </div>
        </TitleWrap>
        <div className="flex flex-col items-end gap-1">
          {features.points && o.points !== 0 && <Badge tone="primary">{o.points > 0 ? `+${o.points}` : o.points} pts</Badge>}
          {(o.status !== "pending" || overdue) && <Badge tone={overdue ? "error" : status.tone}>{overdue ? "Overdue" : status.label}</Badge>}
        </div>
      </div>
      {o.noteMd && <p className="rounded-sm bg-surface-container px-3 py-2 text-body-medium whitespace-pre-wrap text-on-surface-variant">{o.noteMd}</p>}

      {(o.status === "pending" || (isDom && o.status === "submitted")) && (
        <div className="flex flex-wrap items-center gap-2">
          {o.status === "pending" && mine && (
            <Button variant="filled" icon="check" onClick={() => setCompleting(true)}>
              Done
            </Button>
          )}
          {o.status === "submitted" && isDom && (
            <>
              <Button
                icon="thumb_up"
                busy={review.isPending}
                onClick={() =>
                  review.mutate({ id: o.id, approve: true }, { onSuccess: () => snack("Approved"), onError: (e) => snack(errorMessage(e)) })
                }
              >
                Approve
              </Button>
              <Button
                variant="outlined"
                icon="thumb_down"
                disabled={review.isPending}
                onClick={() =>
                  review.mutate({ id: o.id, approve: false }, { onSuccess: () => snack("Sent back"), onError: (e) => snack(errorMessage(e)) })
                }
              >
                Reject
              </Button>
            </>
          )}
          <div className="flex-1" />
          {o.status === "pending" && <IconButton icon="schedule" label="Reschedule" onClick={() => setRescheduling(true)} />}
        </div>
      )}

      <CompleteDialog o={o} open={completing} onClose={() => setCompleting(false)} />

      <RescheduleSheet occurrence={o} open={rescheduling} onClose={() => setRescheduling(false)} />
    </div>
  );
}

function TitleWrap({ linkTask, taskId, children }: { linkTask: boolean; taskId: string; children: React.ReactNode }) {
  if (!linkTask) return <div className="min-w-0 flex-1">{children}</div>;
  return (
    <Link to="/tasks/$taskId" params={{ taskId }} className="state-layer -m-2 min-w-0 flex-1 rounded-sm p-2">
      {children}
    </Link>
  );
}

/** Marks an occurrence done, with an optional note. */
export function CompleteDialog({ o, open, onClose }: { o: Occurrence; open: boolean; onClose: () => void }) {
  const { rel } = useRel();
  const snack = useSnackbar();
  const complete = useCompleteOccurrence(rel.id);
  const [note, setNote] = useState("");
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Done: ${o.title}`}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button
            busy={complete.isPending}
            onClick={() =>
              complete.mutate(
                { id: o.id, noteMd: note.trim() || undefined },
                {
                  onSuccess: (res) => {
                    onClose();
                    setNote("");
                    snack(res?.status === "submitted" ? "Sent for approval" : "Marked done");
                  },
                  onError: (e) => snack(errorMessage(e)),
                },
              )
            }
          >
            Mark done
          </Button>
        </>
      }
    >
      <TextArea label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={5000} />
    </Dialog>
  );
}
