import { useState } from "react";
import { useDelays, useMarkRedeemed, useMoodSeen, useSeenDelay } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { LedgerEntry, Occurrence } from "../api/types";
import { ago, fmtDateTime, fmtTime, localDateOf, today } from "../lib/dates";
import { useRel } from "../lib/relationship";
import { ReplyDialog } from "./Comments";
import { MOOD_LABELS, MOODS } from "./Mood";
import { Button, Dialog, Icon, IconButton, TextField, useSnackbar } from "./ui";

/** A low check-in in a Dominant's Needs you: what they said, a reply in its comments, or just "seen". */
export function MoodRow({ o }: { o: Occurrence }) {
  const { rel, memberName } = useRel();
  const snack = useSnackbar();
  const seen = useMoodSeen(rel.id);
  const [replying, setReplying] = useState(false);
  const who = memberName(o.assigneeId);
  const feeling = MOOD_LABELS[o.mood! - 1]!.toLowerCase();
  return (
    <div className="flex min-h-16 items-center gap-2 bg-surface-container-low py-2 pr-2 pl-1">
      <span className="flex size-10 shrink-0 items-center justify-center">
        <Icon name={MOODS[o.mood! - 1]!} filled className="text-tertiary" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-body-large text-on-surface">
          {who} checked in feeling {feeling}
        </div>
        <div className="text-body-medium text-on-surface-variant">
          {o.noteMd ? <span className="italic">“{o.noteMd}”</span> : o.title} · {ago(o.completedAt!)}
        </div>
      </div>
      <IconButton
        icon="check"
        label="Seen"
        disabled={seen.isPending}
        onClick={() => seen.mutate(o.id, { onSuccess: () => snack("Marked seen"), onError: (e) => snack(errorMessage(e)) })}
      />
      <IconButton icon="chat" label="Reply" variant="tonal" onClick={() => setReplying(true)} />
      {replying && (
        <ReplyDialog
          o={o}
          title={`${who} is feeling ${feeling}`}
          intro={`${o.noteMd ? `“${o.noteMd}” ` : ""}${o.title}, ${fmtDateTime(o.completedAt!)}. Your reply goes in its comments.`}
          onClose={() => setReplying(false)}
        />
      )}
    </div>
  );
}

/** A reward the sub spent points on, waiting for a Dominant to give it and mark it redeemed. */
export function RedemptionRow({ e }: { e: LedgerEntry }) {
  const { memberName } = useRel();
  const [marking, setMarking] = useState(false);
  return (
    <div className="flex min-h-16 items-center gap-2 bg-surface-container-low py-2 pr-2 pl-1">
      <span className="flex size-10 shrink-0 items-center justify-center">
        <Icon name="redeem" className="text-primary" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-body-large text-on-surface">{e.note}</div>
        <div className="text-body-medium text-on-surface-variant">
          {memberName(e.userId)} spent {-e.delta} pts{e.consequenceTitle ? ` to get out of ${e.consequenceTitle}` : ""} · {ago(e.createdAt)}
        </div>
      </div>
      <Button variant="tonal" onClick={() => setMarking(true)}>
        Redeemed
      </Button>
      {marking && <RedeemedDialog e={e} onClose={() => setMarking(false)} />}
    </div>
  );
}

function RedeemedDialog({ e, onClose }: { e: LedgerEntry; onClose(): void }) {
  const { rel, memberName } = useRel();
  const snack = useSnackbar();
  const mark = useMarkRedeemed(rel.id);
  const [note, setNote] = useState("");
  const who = memberName(e.userId);
  return (
    <Dialog
      open
      onClose={onClose}
      icon="redeem"
      title={`Redeem “${e.note}”`}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button
            busy={mark.isPending}
            onClick={() =>
              mark.mutate(
                { id: e.id, note: note.trim() || null },
                {
                  onSuccess: () => {
                    onClose();
                    snack("Redeemed");
                  },
                  onError: (x) => snack(errorMessage(x)),
                },
              )
            }
          >
            Redeemed
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p>
          {who} spent {-e.delta} points on this. Mark it once you've given it, and {who} is told.
          {e.consequenceTitle && ` ${e.consequenceTitle} is excused then, with no penalty.`}
        </p>
        <TextField label={`Note to ${who} (optional)`} value={note} onChange={(x) => setNote(x.target.value)} maxLength={500} />
      </div>
    </Dialog>
  );
}

/** "6:00 PM" today, "Thu, Oct 22, 6:00 PM" another day. */
const dayAndTime = (at: string) => (localDateOf(new Date(at)) === today() ? fmtTime(at) : fmtDateTime(at));

/** Delays the sub took from their weekly allowance: no decision needed, but the Dominant hears about each. */
export function DelayCards() {
  const { rel, isDom, memberName } = useRel();
  const snack = useSnackbar();
  const delays = useDelays(rel.id, isDom && rel.reschedulePolicy === "allowance");
  const seen = useSeenDelay(rel.id);
  if (!delays.data?.length) return null;
  return (
    <div className="flex flex-col gap-3 px-4 pb-4 md:px-6">
      {delays.data.map((d) => {
        const one = d.items.length === 1 ? d.items[0]! : null;
        return (
          <div key={d.id} className="flex items-start gap-4 rounded-xl bg-surface-container-high px-4 py-3 text-on-surface">
            <Icon name="more_time" filled className="mt-0.5 text-primary" />
            <div className="min-w-0 flex-1">
              <div className="text-title-medium">{memberName(d.requestedBy)} used a delay</div>
              <div className="text-body-medium text-on-surface-variant">
                {one ? (
                  <>
                    {one.title} · {dayAndTime(one.fromDueAt)} <Icon name="arrow_forward" size={16} className="align-[-3px]" /> {fmtTime(one.toDueAt)}
                  </>
                ) : (
                  `${d.items.length} tasks moved`
                )}
                {" · "}
                {d.left} of {d.allowance} left this week
              </div>
              {d.reason && <div className="mt-0.5 text-body-medium italic text-on-surface-variant">“{d.reason}”</div>}
            </div>
            <IconButton icon="close" label="Got it" onClick={() => seen.mutate(d.id, { onError: (e) => snack(errorMessage(e)) })} />
          </div>
        );
      })}
    </div>
  );
}
