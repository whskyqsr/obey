import { useState } from "react";
import type { Occurrence } from "../api/types";
import { useTickStep } from "../api/hooks";
import { errorMessage } from "../api/client";
import { useRel } from "../lib/relationship";
import { CompleteDialog, isOpen, opensLabel } from "./OccurrenceCard";
import { useQuickComplete } from "./TaskRow";
import { Button, Dialog, Icon, cx, useSnackbar } from "./ui";

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
    if (o.proofRequired || o.askMood) setFinishing(true);
    else {
      quickComplete(o);
      onClose();
    }
  }

  return (
    <>
      <Dialog
        open={open && !finishing}
        onClose={onClose}
        title={o.title}
        actions={
          <>
            <Button variant="text" onClick={onClose}>
              {current ? "Later" : "Close"}
            </Button>
            {current ? (
              <Button icon="check" disabled={!ready} onClick={() => toggle(current.id, true)}>
                {index === o.steps.length - 1 ? "Done" : "Done, next"}
              </Button>
            ) : (
              <Button icon="task_alt" disabled={tick.isPending} onClick={finish}>
                Finish
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="flex flex-1 gap-1" aria-hidden>
              {o.steps.map((s) => (
                <span key={s.id} className={cx("h-1 flex-1 rounded-full", done.has(s.id) ? "bg-primary" : "bg-surface-container-highest")} />
              ))}
            </div>
            <span className="text-label-medium text-on-surface-variant tabular-nums">
              {Math.min(index + 1, o.steps.length)} of {o.steps.length}
            </span>
          </div>
          {!ready && <p className="text-body-medium text-on-surface-variant">This one {opensLabel(o)}.</p>}
          {current ? (
            <div className="rounded-lg bg-primary-container px-5 py-6 text-on-primary-container">
              <div className="text-label-large opacity-80">Step {index + 1}</div>
              <div className="mt-1 text-headline-small">{current.title}</div>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-lg bg-primary-container px-5 py-6 text-on-primary-container">
              <Icon name="check_circle" filled size={32} />
              <div className="text-title-large">Every step done</div>
            </div>
          )}
          <ol className="flex flex-col">
            {o.steps.map((s, i) => {
              const on = done.has(s.id);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    disabled={!ready}
                    onClick={() => toggle(s.id, !on)}
                    aria-pressed={on}
                    className={cx("state-layer flex w-full items-center gap-3 rounded-md px-2 py-2 text-left", s === current && "bg-surface-container")}
                  >
                    <Icon name={on ? "check_circle" : "radio_button_unchecked"} filled={on} className={on ? "text-primary" : "text-outline"} />
                    <span className={cx("flex-1 text-body-large", on ? "text-on-surface-variant line-through" : "text-on-surface")}>
                      {i + 1}. {s.title}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </Dialog>
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
            <Icon name={on ? "check_circle" : "radio_button_unchecked"} filled={on} size={18} className={on ? "text-primary" : "text-outline"} />
            <span className={on ? "text-on-surface-variant line-through" : "text-on-surface"}>
              {i + 1}. {s.title}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
