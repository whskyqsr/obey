import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Occurrence } from "../api/types";
import { useTickStep } from "../api/hooks";
import { errorMessage } from "../api/client";
import { useRel } from "../lib/relationship";
import { CompleteDialog, isOpen, opensLabel } from "./OccurrenceCard";
import { useQuickComplete } from "./TaskRow";
import { Button, Diamond, IconButton, cx, useSnackbar } from "./ui";

export const isRitual = (o: Occurrence) => o.steps.length > 0;

/** "2 of 5 steps" */
export const stepProgress = (o: Occurrence) => `${o.stepsDone.length} of ${o.steps.length} steps`;

/**
 * The run view for a ritual: the next step large, the whole list under it, and one button that ticks the current
 * step and moves on. When the last one is done it finishes the task (through the proof sheet if it needs proof).
 */
export function RitualDialog({ o, open, onClose }: { o: Occurrence; open: boolean; onClose: () => void }) {
  const { rel } = useRel();
  const snack = useSnackbar();
  const tick = useTickStep(rel.id);
  const quickComplete = useQuickComplete();
  // Ticks show at once; the server catches up behind them.
  const [done, setDone] = useState(() => new Set(o.stepsDone));
  const [finishing, setFinishing] = useState(false);
  const current = o.steps.find((s) => !done.has(s.id));
  const index = current ? o.steps.indexOf(current) : o.steps.length;
  const ready = isOpen(o);

  function toggle(stepId: string, on: boolean) {
    setDone((d) => {
      const n = new Set(d);
      if (on) n.add(stepId);
      else n.delete(stepId);
      return n;
    });
    tick.mutate(
      { id: o.id, stepId, done: on },
      {
        onError: (e) => {
          snack(errorMessage(e));
          setDone((d) => {
            const n = new Set(d);
            if (on) n.delete(stepId);
            else n.add(stepId);
            return n;
          });
        },
      },
    );
  }

  function finish() {
    if (o.proofRequired || o.askMood || o.asksJournal) setFinishing(true);
    else {
      quickComplete(o);
      onClose();
    }
  }

  const last = index === o.steps.length - 1;
  const previous = index > 0 ? o.steps[index - 1] : undefined;
  const upNext = current ? o.steps[index + 1] : undefined;

  return (
    <>
      {open && !finishing && (
        <StepRunner onClose={onClose}>
          <div className="flex items-center gap-2 pt-[env(safe-area-inset-top)]">
            <IconButton icon="close" label={current ? "Later" : "Close"} onClick={onClose} className="-ml-2" />
            <div className="flex-1 truncate pr-10 text-center text-body-large text-on-surface-variant">
              {o.title} · {current ? `step ${index + 1} of ${o.steps.length}` : "done"}
            </div>
          </div>
          <div className="mt-4 flex gap-1.5" aria-hidden>
            {o.steps.map((s, i) => (
              <span key={s.id} className={cx("h-[3px] flex-1", i <= index ? "bg-on-surface" : "bg-outline-variant")} />
            ))}
          </div>
          <div className="flex flex-1 flex-col pt-[14dvh] pb-10">
            {current ? (
              <>
                <div className="eyebrow">Step {stepWord(index + 1)}</div>
                <h2 className="mt-3 font-serif text-[44px] leading-[1.1] text-on-surface md:text-[52px]">{current.title}</h2>
              </>
            ) : (
              <>
                <div className="eyebrow">{stepProgress(o)}</div>
                <h2 className="mt-3 font-serif text-[44px] leading-[1.1] text-on-surface md:text-[52px]">Every step done.</h2>
              </>
            )}
            {!ready && <p className="mt-4 text-body-large text-on-surface-variant">This one {opensLabel(o)}.</p>}
          </div>
          <div className="flex flex-col gap-3 pb-[max(16px,env(safe-area-inset-bottom))]">
            {current ? (
              <Button disabled={!ready} onClick={() => toggle(current.id, true)} className="h-12 w-full">
                {last ? "Done" : "Done, next"}
              </Button>
            ) : (
              <Button disabled={tick.isPending} onClick={finish} className="h-12 w-full">
                Finish
              </Button>
            )}
            <div className="flex min-h-10 items-center justify-between gap-4 text-body-large">
              {previous ? (
                <button type="button" onClick={() => toggle(previous.id, false)} className="state-layer -ml-2 rounded-md px-2 py-1 text-on-surface-variant">
                  ‹ Back a step
                </button>
              ) : (
                <span />
              )}
              {upNext && <span className="truncate text-on-surface-variant">Next: {upNext.title}</span>}
            </div>
          </div>
        </StepRunner>
      )}
      {finishing && (
        <CompleteDialog
          o={o}
          open
          onClose={() => {
            setFinishing(false);
            onClose();
          }}
        />
      )}
    </>
  );
}

/** A ritual's steps as a read-only checklist, for the task card. */
export function StepList({ o }: { o: Occurrence }) {
  return (
    <ol className="flex flex-col gap-1">
      {o.steps.map((s, i) => {
        const on = o.stepsDone.includes(s.id);
        return (
          <li key={s.id} className="flex items-center gap-2 text-body-medium">
            <Diamond state={on ? "done" : "open"} size={12} className="mx-0.5" />
            <span className={on ? "text-on-surface-variant" : "text-on-surface"}>
              {i + 1}. {s.title}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const WORDS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
/** "two" for 2, "13" past twelve. */
const stepWord = (n: number) => WORDS[n - 1] ?? String(n);

/** The ritual run view (mockup 16): the whole screen on phones, a centred column on desktop. Escape closes it. */
function StepRunner({ onClose, children }: { onClose(): void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return createPortal(
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 animate-fade-in overflow-y-auto bg-surface text-on-surface">
      <div className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col px-6 pt-4">{children}</div>
    </div>,
    document.body,
  );
}
