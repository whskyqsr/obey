import { useRef, useState } from "react";
import type { Occurrence } from "../api/types";
import { useCountOccurrence } from "../api/hooks";
import { errorMessage } from "../api/client";
import { useRel } from "../lib/relationship";
import { fmtTime } from "../lib/dates";
import { isOpen } from "./OccurrenceCard";
import { Button, Dialog, Icon, cx, useSnackbar } from "./ui";

type Counted = Pick<Occurrence, "countMin" | "countMax">;

/** A count task is marked once each time it's done (cups of water, edges) instead of once. */
export const isCounted = (o: Counted) => o.countMin != null || o.countMax != null;

/** "exactly 3", "at least 8", "no more than 2", "3–5". */
export function countBounds({ countMin: min, countMax: max }: Counted) {
  if (min != null && max != null) return min === max ? `exactly ${min}` : `${min}–${max}`;
  return min != null ? `at least ${min}` : `no more than ${max}`;
}

/** Where a count stands against its bounds. */
export function countState(o: Counted, n: number): "short" | "ok" | "over" {
  if (o.countMax != null && n > o.countMax) return "over";
  if (o.countMin != null && n < o.countMin) return "short";
  return "ok";
}

/** A count task that asks for approval, proof, a mood or an entry: sent once, when the count is met. */
export const sentWhenMet = (o: Occurrence) => isCounted(o) && (o.approvalRequired || o.proofRequired || o.askMood || o.asksJournal);

/** Its count is met and it's waiting for the assignee to send it. "At most" counts go at the deadline instead. */
export const readyToSend = (o: Occurrence) => sentWhenMet(o) && o.countMin != null && o.status === "pending" && countState(o, o.count) === "ok";

/** "5 of at least 8", "3 of 3–5 · done, up to 2 more", "4 of exactly 3 · over by 1". */
export function countLine(o: Occurrence) {
  const n = o.count;
  const base = `${n} of ${countBounds(o)}`;
  const state = countState(o, n);
  if (state === "over") return `${base} · over by ${n - o.countMax!}`;
  if (readyToSend(o)) return `${base} · ready to send`;
  if (o.status !== "completed") return base;
  if (o.countMax != null && n === o.countMax && o.countMin !== o.countMax) return `${base} · at the limit`;
  if (o.countMax != null && o.countMin !== o.countMax) return `${base} · done, up to ${o.countMax - n} more`;
  return `${base} · done`;
}

/** Whether the person can still change the count: their own, open, and not past a miss that's been dealt with. */
export function canCount(o: Occurrence, mine: boolean, isDom: boolean) {
  const live = o.status === "pending" || o.status === "completed" || (o.status === "missed" && !o.missConfirmed);
  return live && (isDom || (mine && isOpen(o) && new Date(o.dueAt).getTime() > Date.now()));
}

/**
 * The count in a ring that fills toward the target. A tap adds one; a long press (or right click) opens the sheet to fix
 * the count. Done shows as a solid circle with the number; over the limit, the ring goes red.
 */
export function CountRing({ o, onTap, onHold, disabled }: { o: Occurrence; onTap?(): void; onHold?(): void; disabled?: boolean }) {
  const timer = useRef<number>(undefined);
  const held = useRef(false);
  const n = o.count;
  const target = o.countMin ?? o.countMax!;
  const state = countState(o, n);
  const done = o.status === "completed" && state === "ok";
  const r = 17;
  const c = 2 * Math.PI * r;
  const label = `${o.title}: ${countLine(o)}`;
  const start = () => {
    held.current = false;
    if (!onHold) return;
    timer.current = window.setTimeout(() => ((held.current = true), onHold()), 500);
  };
  const stop = () => window.clearTimeout(timer.current);
  return (
    <button
      type="button"
      aria-label={onTap ? `Add one to “${o.title}”, ${countLine(o)}` : label}
      title={onTap ? "Tap to add one, hold to change the count" : label}
      disabled={disabled}
      data-action="done"
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onContextMenu={(e) => {
        if (!onHold) return;
        e.preventDefault();
        stop();
        held.current = true;
        onHold();
      }}
      onClick={() => {
        if (held.current) return;
        (onTap ?? onHold)?.();
      }}
      className="state-layer relative flex size-10 shrink-0 items-center justify-center rounded-full disabled:opacity-60"
    >
      <svg viewBox="0 0 40 40" className="absolute inset-0" aria-hidden>
        {done ? (
          <circle cx="20" cy="20" r="14" className="fill-primary" />
        ) : (
          <>
            <circle cx="20" cy="20" r={r} fill="none" strokeWidth="3" className="stroke-surface-container-highest" />
            <circle
              cx="20"
              cy="20"
              r={r}
              fill="none"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${c * Math.min(1, n / target)} ${c}`}
              transform="rotate(-90 20 20)"
              className={state === "over" ? "stroke-error" : "stroke-primary"}
            />
          </>
        )}
      </svg>
      <span className={cx("relative text-[11px] font-semibold tabular-nums", done ? "text-on-primary" : state === "over" ? "text-error" : "text-on-surface")}>
        {done ? n : `${n}/${target}`}
      </span>
    </button>
  );
}

/** One-tap counting with Undo in the snackbar. */
export function useCountTap() {
  const { rel } = useRel();
  const snack = useSnackbar();
  const count = useCountOccurrence(rel.id);
  // onMet opens the send sheet when this tap met a count that's sent with approval, proof, a mood or an entry.
  return (o: Occurrence, onMet?: () => void) =>
    count.mutate(
      { id: o.id, by: 1 },
      {
        onSuccess: (res) => {
          if (onMet && readyToSend(res) && !readyToSend(o)) return onMet();
          snack(`${o.title}: ${countLine(res)}`, { label: "Undo", onClick: () => count.mutate({ id: o.id, by: -1 }, { onError: (e) => snack(errorMessage(e)) }) });
        },
        onError: (e) => snack(errorMessage(e)),
      },
    );
}

/** Sets the count outright, for a mis-tap or one marked late. */
export function CountSheet({ o, open, onClose }: { o: Occurrence; open: boolean; onClose(): void }) {
  const { rel } = useRel();
  const count = useCountOccurrence(rel.id);
  const snack = useSnackbar();
  const [n, setN] = useState(o.count);
  const state = countState(o, n);
  const left = o.countMin != null ? o.countMin - n : 0;
  const hint =
    state === "over" ? `Over by ${n - o.countMax!}; it counts as failed` : left > 0 ? `${left} more to go` : o.countMin == null ? "Done at the deadline if it stays here" : "Done";
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={o.title}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={count.isPending} disabled={n === o.count} onClick={() => count.mutate({ id: o.id, to: n }, { onSuccess: onClose, onError: (e) => snack(errorMessage(e)) })}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-body-medium text-on-surface-variant">
          {countBounds(o).replace(/^./, (c) => c.toUpperCase())}, by {fmtTime(o.dueAt)}. Logged {o.count} so far.
        </p>
        <div className="flex items-center justify-center gap-6">
          <button
            type="button"
            aria-label="One fewer"
            disabled={n === 0}
            onClick={() => setN(n - 1)}
            className="state-layer flex size-14 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container disabled:opacity-40"
          >
            <Icon name="remove" />
          </button>
          <span className={cx("min-w-24 text-center text-display-large tabular-nums", state === "over" ? "text-error" : "text-on-surface")} aria-live="polite">
            {n}
          </span>
          <button
            type="button"
            aria-label="One more"
            onClick={() => setN(n + 1)}
            className="state-layer flex size-14 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container"
          >
            <Icon name="add" />
          </button>
        </div>
        <p className={cx("text-center text-body-medium", state === "over" ? "text-error" : "text-on-surface-variant")}>{hint}</p>
      </div>
    </Dialog>
  );
}
