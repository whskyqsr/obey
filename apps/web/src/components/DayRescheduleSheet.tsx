import { useEffect, useState } from "react";
import type { Occurrence } from "../api/types";
import { useRescheduleDay } from "../api/hooks";
import { errorMessage } from "../api/client";
import { fmtDateTime, fmtTime } from "../lib/dates";
import { useRel } from "../lib/relationship";
import { Button, Checkbox, Chip, Dialog, TextArea, useSnackbar } from "./ui";

const DELAYS = [2, 12, 24, 48] as const;

/** "More time for today": delay several of today's open tasks together, as one request. */
export function DayRescheduleSheet({ tasks, open, onClose }: { tasks: Occurrence[]; open: boolean; onClose(): void }) {
  const { rel, isDom } = useRel();
  const snack = useSnackbar();
  const mutation = useRescheduleDay(rel.id);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hours, setHours] = useState<number>(24);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) {
      setSelected(new Set(tasks.map((t) => t.id)));
      setHours(24);
      setReason("");
    }
  }, [open, tasks]);

  const willRequest = !isDom && rel.reschedulePolicy === "request";
  const subBlocked = !isDom && rel.reschedulePolicy === "dominant_only";
  const shift = (iso: string) => new Date(new Date(iso).getTime() + hours * 3_600_000).toISOString();

  function toggle(id: string, on: boolean) {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    setSelected(next);
  }

  function submit() {
    mutation.mutate(
      { occurrenceIds: [...selected], delayHours: hours, ...(reason.trim() ? { reason: reason.trim() } : {}) },
      {
        onSuccess: (res) => {
          onClose();
          snack(res.applied ? `Moved ${res.requests.length} tasks` : "Request sent. Waiting for your Dominant.");
        },
        onError: (e) => snack(errorMessage(e)),
      },
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="More time for today"
      icon="more_time"
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} busy={mutation.isPending} disabled={subBlocked || selected.size === 0}>
            {willRequest ? `Request for ${selected.size}` : `Move ${selected.size}`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap gap-2">
          {DELAYS.map((h) => (
            <Chip key={h} selected={hours === h} onClick={() => setHours(h)}>
              +{h} hours
            </Chip>
          ))}
        </div>
        <div className="flex flex-col divide-y divide-outline-variant rounded-md border border-outline-variant px-3">
          {tasks.map((t) => (
            <div key={t.id} className="py-1">
              <Checkbox
                checked={selected.has(t.id)}
                onChange={(on) => toggle(t.id, on)}
                label={
                  <span className="flex flex-col">
                    <span className="text-body-large text-on-surface">{t.title}</span>
                    <span className="text-body-small text-on-surface-variant">
                      {fmtTime(t.dueAt)} → {selected.has(t.id) ? fmtDateTime(shift(t.dueAt)) : "unchanged"}
                    </span>
                  </span>
                }
              />
            </div>
          ))}
        </div>
        <TextArea label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} rows={2} />
        {subBlocked && <p className="text-body-medium text-error">Only your Dominant can move deadlines in this relationship.</p>}
        {willRequest && <p className="text-body-small">Your Dominant approves or declines these together.</p>}
        {!isDom && rel.reschedulePolicy === "allowance" && (
          <p className="text-body-small">This counts as one of your {rel.weeklyDelayAllowance} free delays this week.</p>
        )}
      </div>
    </Dialog>
  );
}
