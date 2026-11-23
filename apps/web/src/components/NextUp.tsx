import { useState } from "react";
import { Link } from "@tanstack/react-router";
import type { Occurrence } from "../api/types";
import { fmtRelative, fmtTime, isAllDayDue } from "../lib/dates";
import { useRel } from "../lib/relationship";
import { HOUR, URGENT, mmss, useNow } from "./Countdown";
import { isCounted } from "./Count";
import { isPlaced } from "./Location";
import { CompleteDialog, isOpen } from "./OccurrenceCard";
import { RescheduleSheet } from "./RescheduleSheet";
import { RitualDialog, isRitual, stepProgress } from "./Ritual";
import { useQuickComplete } from "./TaskRow";
import { Button, cx } from "./ui";

/**
 * The one thing to do next, picked from today's open tasks that are this person's own.
 * Counted and location tasks keep their rings in the list, so they never lead.
 */
export function pickNext(list: Occurrence[], userId: string, now = Date.now()) {
  return list
    .filter((o) => o.assigneeId === userId && o.status === "pending" && isOpen(o) && !isCounted(o) && !isPlaced(o) && !o.curfew)
    .filter((o) => new Date(o.dueAt).getTime() >= now)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
}

/**
 * Today leads with this for whoever has tasks: what's next, when, and Done or More time.
 * Inside the last hour the "when" becomes a live countdown, red in the last 15 minutes.
 */
export function NextUp({ o }: { o: Occurrence }) {
  const { me, rel, isDom, memberName } = useRel();
  const now = useNow();
  const quickComplete = useQuickComplete();
  const [completing, setCompleting] = useState(false);
  const [running, setRunning] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);

  const left = new Date(o.dueAt).getTime() - now;
  const soon = left > 0 && left <= HOUR && !isAllDayDue(o.dueAt);
  const urgent = soon && left <= URGENT;
  const ritual = isRitual(o);
  const needsSheet = o.proofRequired || o.askMood || o.asksJournal;
  // Tasks come from the partner when there is one; a switch or someone solo sets their own.
  const partner = rel.members.find((m) => m.userId !== me.user.id);
  const by = partner && !isDom ? memberName(partner.userId) : null;
  const meta = [
    isAllDayDue(o.dueAt) ? "Any time today" : fmtTime(o.dueAt),
    ritual && o.stepsDone.length ? stepProgress(o) : null,
    o.proofRequired ? (by ? `${by} wants a photo` : "Photo") : null,
    o.approvalRequired && !o.proofRequired ? (by ? `${by} approves it` : "Needs approval") : null,
  ].filter(Boolean);

  return (
    <section aria-label="Next" className="mx-4 mb-8 md:mx-6">
      <div className={cx("eyebrow tabular-nums", urgent && "text-error")}>
        Next · {soon ? `${mmss(left)} left` : isAllDayDue(o.dueAt) ? "today" : fmtRelative(o.dueAt, now)}
      </div>
      <Link
        to="/tasks/$taskId"
        params={{ taskId: o.seriesId }}
        className="mt-1 block font-serif text-[32px] leading-10 text-on-surface hover:underline focus-visible:underline focus-visible:outline-none"
      >
        {o.title}
      </Link>
      <div className="mt-1 text-body-medium text-on-surface-variant">{meta.join(" · ")}</div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button
          className="h-12"
          onClick={() => (ritual ? setRunning(true) : needsSheet ? setCompleting(true) : quickComplete(o))}
        >
          {ritual ? (o.stepsDone.length ? "Carry on" : "Start") : "Done"}
        </Button>
        <Button variant="outlined" className="h-12" onClick={() => setRescheduling(true)}>
          More time
        </Button>
      </div>
      <RescheduleSheet occurrence={o} open={rescheduling} onClose={() => setRescheduling(false)} />
      {completing && <CompleteDialog o={o} open onClose={() => setCompleting(false)} />}
      {running && <RitualDialog o={o} open onClose={() => setRunning(false)} />}
    </section>
  );
}
