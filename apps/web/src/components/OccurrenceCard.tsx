import { useState } from "react";
import { Link } from "@tanstack/react-router";
import type { Occurrence, OccurrenceStatus } from "@obey/contracts";
import { useCompleteOccurrence, useReviewOccurrence } from "../api/hooks";
import { errorMessage } from "../api/client";
import { fmtDate, fmtDateTime, fmtRelative, fmtTime, localDateOf, today } from "../lib/dates";
import { useReadOnly, useRel } from "../lib/relationship";
import { Comments, SendBackDialog } from "./Comments";
import { ProofPhotos } from "./Proof";
import { RitualDialog, StepList, isRitual, stepProgress } from "./Ritual";
import { RescheduleSheet } from "./RescheduleSheet";
import { StreakStrip } from "./StreakStrip";
import { Badge, Button, Dialog, TextArea, cx, useSnackbar } from "./ui";

const STATUS: Record<OccurrenceStatus, { label: string; tone: "primary" | "error" | "tertiary" | "neutral" }> = {
  pending: { label: "To do", tone: "neutral" },
  submitted: { label: "Awaiting review", tone: "tertiary" },
  completed: { label: "Done", tone: "primary" },
  missed: { label: "Missed", tone: "error" },
  excused: { label: "Excused", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

/**
 * Whether the assignee may complete it yet: not before the day after the previous occurrence (tomorrow's daily task
 * waits), and not before its window opens when it has one.
 */
export function isOpen(o: Occurrence, now = Date.now()) {
  return (!o.opensOn || o.opensOn <= today()) && (!o.opensAt || new Date(o.opensAt).getTime() <= now);
}

/** "opens Thu" or "opens 8:30 PM", for a task that isn't open yet. */
export function opensLabel(o: Occurrence) {
  if (o.opensOn && o.opensOn > today()) return `opens ${fmtDate(o.opensOn, { weekday: "short" })}`;
  if (!o.opensAt) return "opens later";
  const at = new Date(o.opensAt);
  return localDateOf(at) === today() ? `opens ${fmtTime(o.opensAt)}` : `opens ${fmtDateTime(o.opensAt)}`;
}

export function isOverdue(o: Occurrence, now = Date.now()) {
  return o.status === "pending" && new Date(o.dueAt).getTime() < now;
}

/** One due date of a task. Its title opens the task, except on the task's own page. */
export function OccurrenceCard({ o, showDate, linkTask = true }: { o: Occurrence; showDate?: boolean; linkTask?: boolean }) {
  const { rel, me, isDom, memberName, features } = useRel();
  const readOnly = useReadOnly();
  const snack = useSnackbar();
  const review = useReviewOccurrence(rel.id);
  const [completing, setCompleting] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [sendingBack, setSendingBack] = useState(false);
  const [commenting, setCommenting] = useState(false);
  const [running, setRunning] = useState(false);

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
        // The title link stretches over the whole card, so the card is the hover and focus target.
        linkTask && "state-layer has-[a[data-card-link]:focus-visible]:outline-2 has-[a[data-card-link]:focus-visible]:outline-primary",
        overdue ? "bg-error-container/60" : "bg-surface-container-low",
        done && "opacity-70",
      )}
    >
      <div className="flex items-start gap-3">
        <TitleWrap linkTask={linkTask} taskId={o.seriesId}>
          <div className={cx("text-title-medium text-on-surface", done && "line-through")}>{o.title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-body-medium text-on-surface-variant">
            <span>
              {/* All-day tasks are due at 23:59:59 local; show "All day" rather than 11:59 PM. */}
              {allDay ? (showDate || !isToday ? `${fmtDate(localDateOf(due))}, all day` : "All day") : showDate || !isToday ? fmtDateTime(o.dueAt) : fmtTime(o.dueAt)}
            </span>
            {o.status === "pending" && <span className={overdue ? "text-error" : ""}>· {fmtRelative(o.dueAt)}</span>}
            {!mine && <span>· {memberName(o.assigneeId)}</span>}
            {o.rescheduled && <span title="Rescheduled">· moved</span>}
          </div>
          <StreakStrip taskId={o.seriesId} className="mt-2" />
        </TitleWrap>
        <div className="flex flex-col items-end gap-1">
          {features.points && o.points !== 0 && <Badge tone="primary">{o.points > 0 ? `+${o.points}` : o.points} pts</Badge>}
          {(o.status !== "pending" || overdue) && <Badge tone={overdue ? "error" : status.tone}>{overdue ? "Overdue" : status.label}</Badge>}
        </div>
      </div>
      {isRitual(o) && (
        <div className="flex flex-col gap-2 rounded-sm bg-surface-container px-3 py-2">
          <div className="text-label-large text-on-surface-variant">{stepProgress(o)}</div>
          <StepList o={o} />
        </div>
      )}
      {o.noteMd && <p className="rounded-sm bg-surface-container px-3 py-2 text-body-medium whitespace-pre-wrap text-on-surface-variant">{o.noteMd}</p>}
      {o.photoCount > 0 && (
        <div className="relative z-10">
          <ProofPhotos o={o} canAdd={mine && (o.status === "pending" || o.status === "submitted")} />
        </div>
      )}

      <div className="relative z-10">
        <Comments o={o} open={commenting} onOpen={() => setCommenting(true)} />
      </div>

      {(o.status === "pending" || (isDom && o.status === "submitted")) && (
        <div className="relative z-10 flex flex-wrap items-center gap-2">
          {o.status === "pending" && mine && isOpen(o) && !isRitual(o) && (
            <Button variant="filled" icon="check" onClick={() => setCompleting(true)}>
              Done
            </Button>
          )}
          {o.status === "pending" && mine && isOpen(o) && isRitual(o) && (
            <Button variant="filled" icon="play_arrow" onClick={() => setRunning(true)}>
              {o.stepsDone.length ? "Continue" : "Start"}
            </Button>
          )}
          {o.status === "pending" && mine && !isOpen(o) && <span className="text-body-medium text-on-surface-variant">{opensLabel(o).replace(/^o/, "O")}</span>}
          {o.status === "submitted" && isDom && (
            <>
              <Button
                icon="thumb_up"
                busy={review.isPending}
                onClick={() => review.mutate({ id: o.id, approve: true }, { onSuccess: () => snack("Approved"), onError: (e) => snack(errorMessage(e)) })}
              >
                Approve
              </Button>
              <Button variant="outlined" icon="undo" disabled={review.isPending} onClick={() => setSendingBack(true)}>
                Send back
              </Button>
            </>
          )}
          {o.status === "pending" && (
            <Button variant={mine ? "outlined" : "tonal"} icon="more_time" onClick={() => setRescheduling(true)}>
              {mine ? "More time" : "Reschedule"}
            </Button>
          )}
          {!commenting && o.commentCount === 0 && !readOnly && (
            <Button variant="text" icon="add_comment" onClick={() => setCommenting(true)}>
              Comment
            </Button>
          )}
        </div>
      )}
      {!(o.status === "pending" || (isDom && o.status === "submitted")) && !commenting && o.commentCount === 0 && !readOnly && (
        <Button variant="text" icon="add_comment" className="relative z-10 self-start" onClick={() => setCommenting(true)}>
          Comment
        </Button>
      )}
      <SendBackDialog o={o} open={sendingBack} onClose={() => setSendingBack(false)} />

      <CompleteDialog o={o} open={completing} onClose={() => setCompleting(false)} />
      {running && <RitualDialog o={o} open onClose={() => setRunning(false)} />}

      <RescheduleSheet occurrence={o} open={rescheduling} onClose={() => setRescheduling(false)} />
    </div>
  );
}

function TitleWrap({ linkTask, taskId, children }: { linkTask: boolean; taskId: string; children: React.ReactNode }) {
  if (!linkTask) return <div className="min-w-0 flex-1">{children}</div>;
  return (
    <Link
      to="/tasks/$taskId"
      params={{ taskId }}
      data-card-link
      className="min-w-0 flex-1 after:absolute after:inset-0 after:rounded-md after:content-[''] focus-visible:outline-none"
    >
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
  const needsProof = o.proofRequired && o.photoCount === 0 && !note.trim();
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
            disabled={needsProof}
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
      <div className="flex flex-col gap-4">
        {o.proofRequired && <p>This one needs proof: add a photo, a note, or both.</p>}
        <ProofPhotos o={o} canAdd />
        <TextArea label={o.proofRequired ? "Note" : "Note (optional)"} value={note} onChange={(e) => setNote(e.target.value)} maxLength={5000} />
      </div>
    </Dialog>
  );
}
