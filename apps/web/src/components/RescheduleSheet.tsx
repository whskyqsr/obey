import { useEffect, useState } from "react";
import type { Occurrence, RescheduleInput } from "../api/types";
import { useReschedule } from "../api/hooks";
import { errorMessage } from "../api/client";
import { fmtDateTime, fromLocalInput, toLocalInput } from "../lib/dates";
import { useRel } from "../lib/relationship";
import { Button, Chip, Dialog, SegmentedButtons, TextArea, TextField, useSnackbar } from "./ui";

type Choice = "1h" | "24h" | "custom";

export function RescheduleSheet({ occurrence, open, onClose }: { occurrence: Occurrence; open: boolean; onClose(): void }) {
  const { rel, isDom } = useRel();
  const snack = useSnackbar();
  const reschedule = useReschedule(rel.id);
  const [choice, setChoice] = useState<Choice>("24h");
  const [custom, setCustom] = useState(() => toLocalInput(occurrence.dueAt));
  const [scope, setScope] = useState<"this" | "following">("this");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) {
      setChoice("24h");
      setCustom(toLocalInput(new Date(new Date(occurrence.dueAt).getTime() + 86_400_000).toISOString()));
      setScope("this");
      setReason("");
    }
  }, [open, occurrence.dueAt]);

  const willRequest = !isDom && rel.reschedulePolicy === "request";
  const subBlocked = !isDom && rel.reschedulePolicy === "dominant_only";

  const newDue =
    choice === "custom"
      ? custom
        ? new Date(custom).toISOString()
        : null
      : new Date(new Date(occurrence.dueAt).getTime() + (choice === "1h" ? 1 : 24) * 3_600_000).toISOString();

  function submit() {
    const input: RescheduleInput = { scope, ...(reason.trim() ? { reason: reason.trim() } : {}) };
    if (choice === "custom") {
      if (!custom) return;
      input.dueAt = fromLocalInput(custom);
    } else input.delayHours = choice === "1h" ? 1 : 24;
    reschedule.mutate(
      { id: occurrence.id, input },
      {
        onSuccess: (res) => {
          onClose();
          snack(res.applied ? "Rescheduled" : "Extension requested. Waiting for your Dominant.");
        },
        onError: (e) => snack(errorMessage(e)),
      },
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Reschedule"
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} busy={reschedule.isPending} disabled={subBlocked || !newDue}>
            {willRequest ? "Request" : "Move"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <p className="text-body-medium">
          <span className="text-on-surface">{occurrence.title}</span> is due {fmtDateTime(occurrence.dueAt)}.
        </p>
        <div className="flex flex-wrap gap-2">
          <Chip selected={choice === "1h"} onClick={() => setChoice("1h")}>
            +1 hour
          </Chip>
          <Chip selected={choice === "24h"} onClick={() => setChoice("24h")}>
            +24 hours
          </Chip>
          <Chip selected={choice === "custom"} onClick={() => setChoice("custom")} icon="event">
            Pick date & time
          </Chip>
        </div>
        {choice === "custom" && (
          <TextField label="New deadline" type="datetime-local" value={custom} onChange={(e) => setCustom(e.target.value)} />
        )}
        {newDue && (
          <p className="text-body-medium">
            New deadline: <span className="text-on-surface">{fmtDateTime(newDue)}</span>
          </p>
        )}
        <SegmentedButtons<"this" | "following">
          value={scope}
          onChange={setScope}
          className="w-full"
          options={[
            { value: "this", label: "This one" },
            { value: "following", label: "This & following" },
          ]}
        />
        <TextArea label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} rows={2} />
        {subBlocked && <p className="text-body-medium text-error">Only your Dominant can move deadlines in this relationship.</p>}
        {willRequest && <p className="text-body-small">Your Dominant will be asked to approve this.</p>}
        {!isDom && rel.reschedulePolicy === "allowance" && (
          <p className="text-body-small">You have up to {rel.weeklyDelayAllowance} free delays a week; beyond that it needs approval.</p>
        )}
      </div>
    </Dialog>
  );
}
