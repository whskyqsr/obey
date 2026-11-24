import { useContext, useEffect, useState } from "react";
import type { CalendarEvent, Occurrence, RescheduleInput } from "../api/types";
import { useReschedule } from "../api/hooks";
import { errorMessage } from "../api/client";
import { fmtDateTime, fmtTime, fromLocalInput, localDateOf, toLocalInput, today } from "../lib/dates";
import { useRel } from "../lib/relationship";
import { WholeDayContext } from "./DayRescheduleSheet";
import { Button, Chip, Dialog, SegmentedButtons, TextField, useSnackbar } from "./ui";

type Choice = "30m" | "1h" | "2h" | "tomorrow" | "after" | "custom";

/** Where "After <event>" moves a task: half an hour after a timed plan, or the same time on the day an all-day plan is over. */
export function afterEvent(dueAt: string, e: CalendarEvent): string {
  const due = new Date(dueAt).getTime();
  const end = new Date(e.endsAt).getTime();
  if (!e.allDay) return new Date(end + 30 * 60_000).toISOString();
  return new Date(due + Math.ceil((end - due) / 86_400_000) * 86_400_000).toISOString();
}

const QUICK: { value: Choice; label: string; minutes: number }[] = [
  { value: "30m", label: "+30 min", minutes: 30 },
  { value: "1h", label: "+1 hour", minutes: 60 },
  { value: "2h", label: "+2 hours", minutes: 120 },
  { value: "tomorrow", label: "Tomorrow, same time", minutes: 24 * 60 },
];

/** "9:00 PM tonight", "8:30 AM today", or the date and time on another day. */
function dueLine(iso: string) {
  if (localDateOf(new Date(iso)) !== today()) return fmtDateTime(iso);
  return `${fmtTime(iso)} ${new Date(iso).getHours() >= 17 ? "tonight" : "today"}`;
}

/** More time for one task (mockup 40): quick amounts, this one or later ones too, a reason, and who is asked. */
export function RescheduleSheet({
  occurrence,
  open,
  onClose,
  after,
  onWholeDay,
}: {
  occurrence: Occurrence;
  open: boolean;
  onClose(): void;
  after?: CalendarEvent;
  /** Offers "More time for everything today instead". */
  onWholeDay?(): void;
}) {
  const { rel, isDom, memberName } = useRel();
  const wholeDayFromToday = useContext(WholeDayContext);
  const wholeDay = onWholeDay ?? (localDateOf(new Date(occurrence.dueAt)) === today() ? wholeDayFromToday : null);
  const snack = useSnackbar();
  const reschedule = useReschedule(rel.id);
  const [choice, setChoice] = useState<Choice>("tomorrow");
  const [custom, setCustom] = useState(() => toLocalInput(occurrence.dueAt));
  const [scope, setScope] = useState<"this" | "following">("this");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) {
      setChoice(after ? "after" : "tomorrow");
      setCustom(toLocalInput(new Date(Math.max(new Date(occurrence.dueAt).getTime(), Date.now()) + 86_400_000).toISOString()));
      setScope("this");
      setReason("");
    }
  }, [open, occurrence.dueAt, after]);

  const willRequest = !isDom && rel.reschedulePolicy === "request";
  const subBlocked = !isDom && rel.reschedulePolicy === "dominant_only";
  const dom = rel.members.find((m) => m.role === "dominant");
  const domName = dom ? memberName(dom.userId) : "your Dominant";

  const quick = QUICK.find((q) => q.value === choice);
  const newDue =
    choice === "after" && after
      ? afterEvent(occurrence.dueAt, after)
      : choice === "custom"
        ? custom
          ? new Date(custom).toISOString()
          : null
        : // A missed or overdue task gets its time from now, so the new deadline is never already past.
          new Date(Math.max(new Date(occurrence.dueAt).getTime(), Date.now()) + (quick?.minutes ?? 0) * 60_000).toISOString();

  function submit() {
    if (!newDue) return;
    const input: RescheduleInput = {
      scope,
      ...(reason.trim() ? { reason: reason.trim() } : {}),
      ...(choice === "custom" ? { dueAt: fromLocalInput(custom) } : { dueAt: newDue }),
    };
    reschedule.mutate(
      { id: occurrence.id, input },
      {
        onSuccess: (res) => {
          onClose();
          snack(res.applied ? "Moved" : `Asked ${domName}`);
        },
        onError: (e) => snack(errorMessage(e)),
      },
    );
  }

  const status = subBlocked
    ? `Only ${domName} can move deadlines here.`
    : willRequest
      ? `${domName} will be asked.`
      : !isDom && rel.reschedulePolicy === "allowance"
        ? `You have ${rel.weeklyDelayAllowance} free delays a week. Past that, ${domName} is asked.`
        : null;

  return (
    <Dialog open={open} onClose={onClose}>
      <div className="flex flex-col gap-5">
        <div>
          <h2 className="font-serif text-[30px] leading-9 text-on-surface">More time for {occurrence.title}</h2>
          <p className="mt-1 text-body-large text-on-surface-variant">
            Due {dueLine(occurrence.dueAt)}.{willRequest && ` ${domName} will be asked.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {after && (
            <Chip plain selected={choice === "after"} onClick={() => setChoice("after")}>
              After {after.title}
            </Chip>
          )}
          {QUICK.map((q) => (
            <Chip key={q.value} plain selected={choice === q.value} onClick={() => setChoice(q.value)}>
              {q.label}
            </Chip>
          ))}
          <Chip plain selected={choice === "custom"} onClick={() => setChoice("custom")}>
            Pick a time…
          </Chip>
        </div>
        {choice === "custom" && <TextField label="New deadline" type="datetime-local" value={custom} onChange={(e) => setCustom(e.target.value)} />}
        {
          <div>
            <div className="mb-1.5 text-body-small text-on-surface-variant">Move</div>
            <SegmentedButtons<"this" | "following">
              value={scope}
              onChange={setScope}
              className="[&>button]:flex-none [&>button]:whitespace-nowrap"
              options={[
                { value: "this", label: "This one" },
                { value: "following", label: "This and later ones" },
              ]}
            />
          </div>
        }
        <TextField label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
        {status && !willRequest && <p className={subBlocked ? "text-body-medium text-error" : "text-body-small text-on-surface-variant"}>{status}</p>}
        <div className="flex flex-col items-stretch gap-3">
          <Button onClick={submit} busy={reschedule.isPending} disabled={subBlocked || !newDue} className="h-12 w-full">
            {willRequest ? `Ask ${domName}` : "Move it"}
          </Button>
          {wholeDay && (
            <button
              type="button"
              onClick={() => {
                onClose();
                wholeDay();
              }}
              className="state-layer rounded-md py-1 text-body-large text-primary"
            >
              More time for everything today instead
            </button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
