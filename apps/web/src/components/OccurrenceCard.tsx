import { Suspense, lazy, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { Occurrence, OccurrenceStatus } from "@obey/contracts";
import { useCompleteOccurrence, useEditOccurrence, useReviewOccurrence } from "../api/hooks";
import { errorMessage } from "../api/client";
import { fmtDate, fmtDateTime, fmtRelative, fmtTime, localDateOf, today } from "../lib/dates";
import { useReadOnly, useRel } from "../lib/relationship";
import { Comments, SendBackDialog } from "./Comments";
import { ProofPhotos } from "./Proof";
import { MOOD_LABELS, MoodPicker } from "./Mood";
import { RitualDialog, StepList, isRitual, stepProgress } from "./Ritual";
import { RescheduleSheet } from "./RescheduleSheet";
import { CountRing, CountSheet, canCount, countLine, isCounted, readyToSend, useCountTap } from "./Count";
import { CheckInButton, PlaceRing, canCheckIn, isPlaced, placeLine, usePlaceLookup } from "./Location";
import { StreakStrip } from "./StreakStrip";
import { Badge, Button, Dialog, Icon, Spinner, TextArea, cx, useSnackbar } from "./ui";
import { importPage } from "../lib/staleBuild";

const MarkdownEditor = lazy(importPage(() => import("./MarkdownEditor").then((m) => ({ default: m.MarkdownEditor }))));

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
/** `plain` is for the task's own page, which already names the task: no title row, just when it's due and what to do. */
export function OccurrenceCard({ o, showDate, linkTask = true, plain }: { o: Occurrence; showDate?: boolean; linkTask?: boolean; plain?: boolean }) {
  const { rel, me, isDom, memberName, features } = useRel();
  const readOnly = useReadOnly();
  const snack = useSnackbar();
  const review = useReviewOccurrence(rel.id);
  const edit = useEditOccurrence(rel.id);
  const [completing, setCompleting] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [sendingBack, setSendingBack] = useState(false);
  const [commenting, setCommenting] = useState(false);
  const [running, setRunning] = useState(false);
  const [counting, setCounting] = useState(false);
  const countTap = useCountTap();
  const placeOf = usePlaceLookup();

  const mine = o.assigneeId === me.user.id;
  const counted = isCounted(o);
  const countable = counted && canCount(o, mine, isDom);
  const placed = isPlaced(o);
  // Someone still staying at a place past the deadline got there in time.
  const overdue = isOverdue(o) && !o.arrivedAt;
  const done = o.status === "completed" || o.status === "excused" || o.status === "cancelled";
  const isToday = localDateOf(new Date(o.dueAt)) === today();
  const due = new Date(o.dueAt);
  const allDay = due.getHours() === 23 && due.getMinutes() === 59 && due.getSeconds() === 59;
  const status = STATUS[o.status];

  return (
    <div
      className={cx(
        // Letters: no box; a due date reads as a row on the page, and overdue shows in the accent, not a fill.
        "relative flex flex-col gap-3 py-3",
        // The title link stretches over the whole row, so the row is the hover and focus target.
        linkTask && "state-layer state-row has-[a[data-card-link]:focus-visible]:outline-2 has-[a[data-card-link]:focus-visible]:outline-primary",
      )}
    >
      <div className={cx("flex items-start gap-3", plain && "hidden")}>
        <TitleWrap linkTask={linkTask} taskId={o.seriesId}>
          <div className={cx("text-title-medium", done ? "text-on-surface-variant" : "text-on-surface")}>{o.title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-body-medium text-on-surface-variant">
            <span>
              {/* All-day tasks are due at 23:59:59 local; show "All day" rather than 11:59 PM. */}
              {allDay
                ? showDate || !isToday
                  ? `${fmtDate(localDateOf(due))}, all day`
                  : "All day"
                : showDate || !isToday
                  ? fmtDateTime(o.dueAt)
                  : fmtTime(o.dueAt)}
            </span>
            {o.status === "pending" && <span className={overdue ? "text-error" : ""}>· {fmtRelative(o.dueAt)}</span>}
            {!mine && <span>· {memberName(o.assigneeId)}</span>}
            {o.rescheduled && <span title="Rescheduled">· moved</span>}
          </div>
          <StreakStrip taskId={o.seriesId} className="mt-2" />
        </TitleWrap>
        <div className="flex flex-col items-end gap-1">
          {features.points && o.points !== 0 && (
            <Badge tone="primary">
              {o.points > 0 ? `+${o.points}` : o.points} pts{counted && o.countPer === "count" ? " each" : ""}
            </Badge>
          )}
          {(o.status !== "pending" || overdue) && (
            <Badge tone={overdue ? "error" : status.tone}>{overdue ? "Overdue" : o.leftAt ? "Left early" : status.label}</Badge>
          )}
        </div>
      </div>
      {plain && (
        <p className={cx("text-body-large", overdue ? "text-error" : "text-on-surface")}>
          {allDay ? `${fmtDate(localDateOf(due))}, all day` : fmtDateTime(o.dueAt)}
          <span className={overdue ? "" : "text-on-surface-variant"}>
            {o.status === "pending" ? ` · ${fmtRelative(o.dueAt)}` : ` · ${overdue ? "Overdue" : o.leftAt ? "Left early" : status.label.toLowerCase()}`}
            {!mine && ` · ${memberName(o.assigneeId)}`}
            {o.rescheduled && " · moved"}
          </span>
        </p>
      )}
      {counted && (
        <div className="relative z-10 flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <CountRing
              o={o}
              onTap={countable && mine ? () => (readyToSend(o) ? setCompleting(true) : countTap(o, () => setCompleting(true))) : undefined}
              onHold={countable ? () => setCounting(true) : undefined}
              disabled={!countable}
            />
            <span className="min-w-0 flex-1 text-body-medium text-on-surface">{countLine(o)}</span>
          </div>
          {countable && (
            <div className="flex flex-wrap gap-2">
              {mine && readyToSend(o) && <Button onClick={() => setCompleting(true)}>Send</Button>}
              {mine && (
                <Button variant="outlined" onClick={() => countTap(o, () => setCompleting(true))}>
                  One more
                </Button>
              )}
              <Button variant="text" onClick={() => setCounting(true)}>
                Change the count
              </Button>
            </div>
          )}
        </div>
      )}
      {placed && (
        <div className="relative z-10 flex flex-wrap items-center gap-3">
          <PlaceRing o={o} />
          <span className="min-w-0 flex-1 text-body-medium text-on-surface">
            {placeLine(o, placeOf(o.placeId)) ?? placeOf(o.placeId)?.name}
            {o.status === "pending" && !o.arrivedAt && mine && (
              <span className="block text-body-small text-on-surface-variant">Your phone checks in when you get there, or tap I'm here.</span>
            )}
          </span>
          {canCheckIn(o, mine) && <CheckInButton o={o} />}
        </div>
      )}
      {counting && <CountSheet o={o} open onClose={() => setCounting(false)} />}
      {isRitual(o) && (
        <div className="flex flex-col gap-2">
          <div className="text-label-large text-on-surface-variant">{stepProgress(o)}</div>
          <StepList o={o} />
        </div>
      )}
      {o.journalNoteId && (
        <Link
          to="/journal/$noteId"
          params={{ noteId: o.journalNoteId }}
          className="relative z-10 flex items-center gap-1.5 self-start text-label-large text-primary"
        >
          <Icon name="auto_stories" size={18} /> Read the journal entry
        </Link>
      )}
      {o.mood && <p className="text-body-medium text-on-surface-variant">Felt {MOOD_LABELS[o.mood - 1]!.toLowerCase()}</p>}
      {o.noteMd && <p className="border-l-2 border-primary pl-3 font-serif text-[17px] whitespace-pre-wrap text-on-surface italic">“{o.noteMd}”</p>}
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
          {o.status === "pending" && mine && isOpen(o) && !isRitual(o) && !counted && !placed && (
            <Button variant="filled" onClick={() => setCompleting(true)}>
              Done
            </Button>
          )}
          {o.status === "pending" && mine && isOpen(o) && isRitual(o) && (
            <Button variant="filled" onClick={() => setRunning(true)}>
              {o.stepsDone.length ? "Continue" : "Start"}
            </Button>
          )}
          {o.status === "pending" && mine && !isOpen(o) && <span className="text-body-medium text-on-surface-variant">{opensLabel(o).replace(/^o/, "O")}</span>}
          {o.status === "submitted" && isDom && (
            <>
              <Button
                busy={review.isPending}
                onClick={() => review.mutate({ id: o.id, approve: true }, { onSuccess: () => snack("Approved"), onError: (e) => snack(errorMessage(e)) })}
              >
                Approve
              </Button>
              <Button variant="outlined" disabled={review.isPending} onClick={() => setSendingBack(true)}>
                Send back
              </Button>
            </>
          )}
          {o.status === "pending" && (
            <Button variant="outlined" onClick={() => setRescheduling(true)}>
              {mine ? "More time" : "Reschedule"}
            </Button>
          )}
          {!commenting && o.commentCount === 0 && !readOnly && (
            <Button variant="text" onClick={() => setCommenting(true)}>
              Add a word
            </Button>
          )}
        </div>
      )}
      {/* A Dominant settles a miss from here too: excuse it, or move it, which reopens it. */}
      {o.status === "missed" && isDom && !mine && !readOnly && (
        <div className="relative z-10 flex flex-wrap items-center gap-2">
          <Button
            variant="outlined"
            busy={edit.isPending}
            onClick={() => edit.mutate({ id: o.id, change: { status: "excused" } }, { onSuccess: () => snack("Excused"), onError: (e) => snack(errorMessage(e)) })}
          >
            Excuse
          </Button>
          <Button variant="outlined" disabled={edit.isPending} onClick={() => setRescheduling(true)}>
            Reschedule
          </Button>
          {!commenting && o.commentCount === 0 && (
            <Button variant="text" onClick={() => setCommenting(true)}>
              Add a word
            </Button>
          )}
        </div>
      )}
      {!(o.status === "pending" || (isDom && o.status === "submitted") || (o.status === "missed" && isDom && !mine && !readOnly)) && !commenting && o.commentCount === 0 && !readOnly && (
        <Button variant="text" className="relative z-10 self-start" onClick={() => setCommenting(true)}>
          Add a word
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
  const { me, partners } = useRel();
  const partnerNames = partners.map((m) => m.displayName).join(" and ");
  const [note, setNote] = useState("");
  const [mood, setMood] = useState<number | null>(null);
  // Only the assignee answers a check-in; a Dominant marking it done skips the mood.
  const asksMood = o.askMood && o.assigneeId === me.user.id;
  // A journal task is done by writing the entry, which also counts as proof.
  const asksJournal = o.asksJournal && o.assigneeId === me.user.id;
  const [entry, setEntry] = useState("");
  const needsProof = o.proofRequired && o.photoCount === 0 && !note.trim() && !(asksJournal && entry.trim());
  // A count task met its count and is sent once, with what it asks for.
  const sending = isCounted(o);
  const sendTitle = `${o.countMax != null && o.countMax === o.countMin ? `${o.count} of ${o.countMax}` : `${o.count} done`}, send it${o.approvalRequired && partnerNames ? ` to ${partnerNames}` : ""}?`;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={sending ? sendTitle : asksMood || asksJournal ? o.title : `Done: ${o.title}`}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            {sending ? "Not yet" : "Cancel"}
          </Button>
          <Button
            busy={complete.isPending}
            disabled={needsProof || (asksMood && !mood) || (asksJournal && !entry.trim())}
            onClick={() =>
              complete.mutate(
                {
                  id: o.id,
                  noteMd: note.trim() || undefined,
                  mood: asksMood ? mood! : undefined,
                  journal: asksJournal ? { title: o.title, bodyMd: entry } : undefined,
                },
                {
                  onSuccess: (res) => {
                    onClose();
                    setNote("");
                    setMood(null);
                    setEntry("");
                    snack(res?.status === "submitted" ? "Sent for approval" : asksJournal ? "Saved to your journal" : asksMood ? "Checked in" : "Marked done");
                  },
                  onError: (e) => snack(errorMessage(e)),
                },
              )
            }
          >
            {sending ? "Send" : asksJournal ? "Save entry" : asksMood ? "Check in" : "Mark done"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {sending && (
          <p className="text-body-medium text-on-surface-variant">
            {o.approvalRequired ? `${partnerNames || "Your Dominant"} approves it. Your count is locked until then.` : "It's done once you send it."}
          </p>
        )}
        {asksMood && (
          <>
            <p className="text-title-medium text-on-surface">How do you feel?</p>
            <MoodPicker value={mood} onChange={setMood} />
          </>
        )}
        {asksJournal ? (
          <>
            {o.journalPrompt?.trim() && (
              <blockquote className="border-l-4 border-primary pl-3 text-body-large whitespace-pre-wrap text-on-surface">{o.journalPrompt.trim()}</blockquote>
            )}
            <div>
              <Suspense fallback={<Spinner />}>
                <MarkdownEditor value={entry} onChange={setEntry} editable placeholder="Write your entry" label="Your entry" compact />
              </Suspense>
              <p className="mt-1 px-1 text-body-small text-on-surface-variant">Saved to your journal and shared with {partnerNames || "your partner"}.</p>
            </div>
          </>
        ) : (
          <>
            {o.proofRequired && <p>This one needs proof: add a photo, a note, or both.</p>}
            <ProofPhotos o={o} canAdd />
            <TextArea
              label={o.proofRequired ? "Note" : asksMood ? "Anything to add? (optional)" : "Note (optional)"}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={5000}
            />
          </>
        )}
      </div>
    </Dialog>
  );
}
