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
import { Button, Icon, cx } from "./ui";

const HOUR = 60 * 60_000;
const URGENT = 15 * 60_000;

/** Ticks once a second while mounted. */
function useNow() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** The soonest open deadline in the next hour that this person does or hands out; counted and location tasks have their own rings. */
export function nextDeadline(list: Occurrence[], userId: string, isDom: boolean, now: number) {
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
export function CountdownCard() {
  const { me, isDom, solo, rel, memberName } = useRel();
  const occ = useTodayOccurrences();
  const now = useNow();
  const quickComplete = useQuickComplete();
  const [completing, setCompleting] = useState(false);
  const [running, setRunning] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const o = nextDeadline(occ.data ?? [], me.user.id, isDom, now);
  if (!o) return null;

  const left = new Date(o.dueAt).getTime() - now;
  const urgent = left <= URGENT;
  const mine = o.assigneeId === me.user.id;
  const other = rel.members.find((m) => m.userId !== me.user.id);
  const who = solo ? null : mine ? (other ? `From ${memberName(other.userId)}` : null) : `For ${memberName(o.assigneeId)}`;
  const done = () => (isRitual(o) ? setRunning(true) : o.proofRequired || o.askMood || o.asksJournal ? setCompleting(true) : quickComplete(o));

  return (
    <section
      aria-label={`Countdown: ${o.title}`}
      className={cx("mx-4 mb-4 flex flex-col gap-3 rounded-xl p-4 md:mx-6", urgent ? "bg-error-container text-on-error-container" : "bg-tertiary-container text-on-tertiary-container")}
    >
      <div className="flex items-start gap-3">
        <Icon name="timer" filled className="mt-0.5" />
        <Link to="/tasks/$taskId" params={{ taskId: o.seriesId }} className="min-w-0 flex-1 hover:underline">
          <div className="truncate text-title-medium">{o.title}</div>
          <div className="text-body-medium">{[who, `due ${fmtTime(o.dueAt)}`].filter(Boolean).join(" · ")}</div>
        </Link>
        <div className="text-display-small tabular-nums" role="timer" aria-live="off">
          {mmss(left)}
        </div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-current/15" aria-hidden>
        <div className={cx("h-full rounded-full transition-[width] duration-1000 ease-linear", urgent ? "bg-error" : "bg-tertiary")} style={{ width: `${(left / HOUR) * 100}%` }} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {mine && isOpen(o, now) && (
          <Button icon={isRitual(o) ? "play_arrow" : "check"} variant={urgent ? "danger" : "filled"} onClick={done}>
            {isRitual(o) ? "Start" : "Done"}
          </Button>
        )}
        {(mine || isDom) && (
          <Button variant="text" icon="more_time" onClick={() => setRescheduling(true)} className="text-current!">
            {mine ? "More time" : "Reschedule"}
          </Button>
        )}
      </div>
      <RescheduleSheet occurrence={o} open={rescheduling} onClose={() => setRescheduling(false)} />
      {completing && <CompleteDialog o={o} open onClose={() => setCompleting(false)} />}
      {running && <RitualDialog o={o} open onClose={() => setRunning(false)} />}
    </section>
  );
}
