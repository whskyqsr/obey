import { useState } from "react";
import { Link } from "@tanstack/react-router";
import type { Occurrence } from "../api/types";
import { useReviewOccurrence } from "../api/hooks";
import { errorMessage } from "../api/client";
import { fmtDateTime, fmtTime, localDateOf, today } from "../lib/dates";
import { useRel } from "../lib/relationship";
import { MOOD_LABELS } from "./Mood";
import { ProofPhotos } from "./Proof";
import { ReplyDialog, SendBackDialog } from "./Comments";
import { Button, useSnackbar } from "./ui";

/**
 * A finished task waiting on the Dominant, written as a sentence from the partner: what they finished and what
 * they sent, the photo and their note, then Approve, Send back and Add a word.
 */
export function ReviewCard({ o }: { o: Occurrence }) {
  const { rel, memberName } = useRel();
  const snack = useSnackbar();
  const review = useReviewOccurrence(rel.id);
  const [sendingBack, setSendingBack] = useState(false);
  const [replying, setReplying] = useState(false);
  const who = memberName(o.assigneeId);
  const sent = [o.photoCount > 0 ? (o.photoCount === 1 ? "a photo" : `${o.photoCount} photos`) : null, o.noteMd ? "a note" : null].filter(Boolean);
  const when = o.completedAt ? (localDateOf(new Date(o.completedAt)) === today() ? fmtTime(o.completedAt) : fmtDateTime(o.completedAt)) : null;

  return (
    <article className="flex flex-col gap-3 py-4">
      <p className="text-body-large text-on-surface">
        {who} finished{" "}
        <Link to="/tasks/$taskId" params={{ taskId: o.seriesId }} className="font-medium hover:underline">
          {o.title}
        </Link>
        {sent.length ? ` and sent ${sent.join(" and ")}` : ""}.
        {when && <span className="text-body-medium text-on-surface-variant"> {when}</span>}
      </p>
      <ProofPhotos o={o} />
      {o.noteMd && <blockquote className="font-serif text-[22px] leading-7 text-on-surface-variant italic">“{o.noteMd.trim()}”</blockquote>}
      {o.mood && <div className="text-body-medium text-on-surface-variant">Felt {MOOD_LABELS[o.mood - 1]!.toLowerCase()}</div>}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          busy={review.isPending}
          onClick={() => review.mutate({ id: o.id, approve: true }, { onSuccess: () => snack(`Approved: ${o.title}`), onError: (e) => snack(errorMessage(e)) })}
        >
          Approve
        </Button>
        <Button variant="outlined" disabled={review.isPending} onClick={() => setSendingBack(true)}>
          Send back
        </Button>
        <Button variant="text" className="ml-auto" onClick={() => setReplying(true)}>
          Add a word
        </Button>
      </div>
      <SendBackDialog o={o} open={sendingBack} onClose={() => setSendingBack(false)} />
      {replying && <ReplyDialog o={o} title="Add a word" intro={`${who} sees this under “${o.title}”.`} onClose={() => setReplying(false)} />}
    </article>
  );
}
