import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { Occurrence } from "../api/types";
import { fmtTime, isAllDayDue } from "../lib/dates";
import { useRel } from "../lib/relationship";
import { useTodayOccurrences } from "../lib/today";
import { CompleteDialog, isOpen } from "./OccurrenceCard";
import { RitualDialog, isRitual } from "./Ritual";
import { RescheduleSheet } from "./RescheduleSheet";
import { isCounted } from "./Count";
import { isPlaced } from "./Location";
import { useQuickComplete } from "./TaskRow";
import { IconButton, cx } from "./ui";

export const HOUR = 60 * 60_000;
export const URGENT = 15 * 60_000;

/** Ticks once a second while mounted. */
export function useNow() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** The soonest open deadline in the next hour that this person does or hands out; counted and location tasks have their own rings. */
function nextDeadline(list: Occurrence[], userId: string, isDom: boolean, now: number) {
  return list
    .filter((o) => o.status === "pending" && !o.curfew && !isAllDayDue(o.dueAt) && !isCounted(o) && !isPlaced(o))
    .filter((o) => o.assigneeId === userId || isDom)
    .filter((o) => {
      const left = new Date(o.dueAt).getTime() - now;
      return left > 0 && left <= HOUR;
    })
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
}

export const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** A live countdown on Today for anything due within the hour. It turns red in the last 15 minutes. */
export function CountdownCard({ skip }: { skip?: string } = {}) {
  const { me, isDom, solo, rel, memberName } = useRel();
  const occ = useTodayOccurrences();
  const now = useNow();
  const quickComplete = useQuickComplete();
  const [completing, setCompleting] = useState(false);
  const [running, setRunning] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const o = nextDeadline(occ.data ?? [], me.user.id, isDom, now);
  if (!o || o.id === skip) return null;

  const left = new Date(o.dueAt).getTime() - now;
  const urgent = left <= URGENT;
  const mine = o.assigneeId === me.user.id;
  const other = rel.members.find((m) => m.userId !== me.user.id);
  const who = solo ? null : mine ? (other ? `From ${memberName(other.userId)}` : null) : `For ${memberName(o.assigneeId)}`;
  const done = () => (isRitual(o) ? setRunning(true) : o.proofRequired || o.askMood || o.asksJournal ? setCompleting(true) : quickComplete(o));

  return (
    <section
      aria-label={`Countdown: ${o.title}`}
      className={cx(
        // Letters: paper with an oxblood hairline and a "Due in" eyebrow, the time in serif; red only when it's close.
        "relative mx-4 mb-4 flex items-center gap-3 overflow-hidden rounded-lg border bg-surface-container-lowest py-2.5 pr-2 pl-4 text-on-surface md:mx-6",
        urgent ? "border-error" : "border-primary",
      )}
    >
      <Link to="/tasks/$taskId" params={{ taskId: o.seriesId }} className="min-w-0 flex-1 hover:underline">
        <div className={cx("eyebrow", urgent ? "text-error" : "text-primary")}>Due in</div>
        <div className="truncate text-body-large">{o.title}</div>
        <div className="truncate text-body-small text-on-surface-variant">{[who, fmtTime(o.dueAt)].filter(Boolean).join(" · ")}</div>
      </Link>
      <div className={cx("font-serif text-[34px] leading-9 tabular-nums", urgent && "text-error")} role="timer" aria-live="off">
        {mmss(left)}
      </div>
      {(mine || isDom) && (
        <IconButton icon="more_time" label={mine ? "More time" : "Reschedule"} onClick={() => setRescheduling(true)} className="text-on-surface-variant!" />
      )}
      {mine && isOpen(o, now) && (
        <IconButton
          icon={isRitual(o) ? "play_arrow" : "check"}
          label={isRitual(o) ? "Start" : "Done"}
          variant="filled"
          onClick={done}
          className={urgent ? "bg-error! text-on-error!" : undefined}
        />
      )}
      {/* Time left, as a thin bar along the bottom edge. */}
      <div className="absolute inset-x-0 bottom-0 h-[3px]" aria-hidden>
        <div className={cx("h-full transition-[width] duration-1000 ease-linear", urgent ? "bg-error" : "bg-primary")} style={{ width: `${(left / HOUR) * 100}%` }} />
      </div>
      <RescheduleSheet occurrence={o} open={rescheduling} onClose={() => setRescheduling(false)} />
      {completing && <CompleteDialog o={o} open onClose={() => setCompleting(false)} />}
      {running && <RitualDialog o={o} open onClose={() => setRunning(false)} />}
    </section>
  );
}
