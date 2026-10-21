import { useEffect, useState, type ReactNode } from "react";
import type { CalendarEvent, Occurrence } from "../api/types";
import { useAskCurfew, useCurfew, useCurfewCheck, useDeleteEvent, useDismissClashes, useOccurrences, usePlanReschedule, useSaveEvent } from "../api/hooks";
import { errorMessage } from "../api/client";
import { addDays, fmtDate, fmtTime, fromLocalInput, localDateOf, toLocalInput, today } from "../lib/dates";
import { useRel } from "../lib/relationship";
import { afterEvent } from "./RescheduleSheet";
import { useAskWho } from "./CurfewStrip";
import { Button, Chip, Dialog, Icon, SegmentedButtons, Switch, TextArea, TextField, useSnackbar } from "./ui";

/** "Sat, Oct 18, 7:00 – 11:00 PM", or the dates for an all-day plan (its end is the next midnight, so show the day before). */
export function eventWhen(e: CalendarEvent) {
  const start = new Date(e.startsAt);
  const end = new Date(e.endsAt);
  if (e.allDay) {
    const first = localDateOf(start);
    const last = addDays(localDateOf(end), -1);
    return first === last ? `${fmtDate(first)}, all day` : `${fmtDate(first)} – ${fmtDate(last)}`;
  }
  const sameDay = localDateOf(start) === localDateOf(end);
  return sameDay
    ? `${fmtDate(localDateOf(start))}, ${fmtTime(e.startsAt)} – ${fmtTime(e.endsAt)}`
    : `${fmtDate(localDateOf(start))} ${fmtTime(e.startsAt)} – ${fmtDate(localDateOf(end))} ${fmtTime(e.endsAt)}`;
}

/** Whether an event covers part of a local date. */
export function eventOn(e: CalendarEvent, day: string) {
  return localDateOf(new Date(e.startsAt)) <= day && localDateOf(new Date(new Date(e.endsAt).getTime() - 1)) >= day;
}

type Draft = { title: string; allDay: boolean; withPartner: boolean; start: string; end: string; startDay: string; endDay: string; note: string };

function draftFor(e: CalendarEvent | null, day: string): Draft {
  if (e) {
    return {
      title: e.title,
      allDay: e.allDay,
      withPartner: e.withPartner,
      start: toLocalInput(e.startsAt),
      end: toLocalInput(e.endsAt),
      startDay: localDateOf(new Date(e.startsAt)),
      endDay: addDays(localDateOf(new Date(e.endsAt)), -1),
      note: e.noteMd ?? "",
    };
  }
  // Evening by default; later today if the evening has started.
  const hour = day === today() ? Math.max(18, new Date().getHours() + 1) : 18;
  const at = (h: number) => (h < 24 ? `${day}T${String(h).padStart(2, "0")}:00` : `${addDays(day, 1)}T${String(h - 24).padStart(2, "0")}:00`);
  return { title: "", allDay: false, withPartner: false, start: at(hour), end: at(hour + 2), startDay: day, endDay: day, note: "" };
}

/**
 * Adds, edits or shows a plan on the shared calendar. Either partner adds plans; each changes only their own.
 * Tasks due during the plan are listed underneath with a one-tap reschedule.
 */
export function EventDialog({ event, day, open, onClose }: { event: CalendarEvent | null; day?: string; open: boolean; onClose(): void }) {
  const { rel, me, memberName } = useRel();
  const partnerId = rel.members.find((m) => m.userId !== me.user.id)?.userId;
  const partner = partnerId ? memberName(partnerId) : null;
  const snack = useSnackbar();
  const save = useSaveEvent(rel.id);
  const del = useDeleteEvent(rel.id);
  const [saved, setSaved] = useState<CalendarEvent | null>(event);
  const [draft, setDraft] = useState(() => draftFor(event, day ?? today()));
  const [editing, setEditing] = useState(!event);

  useEffect(() => {
    if (!open) return;
    setSaved(event);
    setDraft(draftFor(event, day ?? today()));
    setEditing(!event);
  }, [open, event, day]);

  const current = saved;
  const mine = !current || current.authorId === me.user.id;
  const curfew = useCurfewWarning(open && editing, draft, current);
  const clashes = useClashes(open && !editing ? current : null);
  const set = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));

  function submit() {
    const input = draft.allDay
      ? {
          title: draft.title,
          allDay: true,
          withPartner: draft.withPartner,
          startsAt: fromLocalInput(`${draft.startDay}T00:00`),
          endsAt: fromLocalInput(`${addDays(draft.endDay, 1)}T00:00`),
          noteMd: draft.note.trim() || null,
        }
      : {
          title: draft.title,
          allDay: false,
          withPartner: draft.withPartner,
          startsAt: fromLocalInput(draft.start),
          endsAt: fromLocalInput(draft.end),
          noteMd: draft.note.trim() || null,
        };
    save.mutate(
      { id: current?.id, input },
      {
        onSuccess: async (res) => {
          if (curfew.ask) {
            try {
              await curfew.ask(res.id, input.endsAt);
              snack(`${current ? "Plan updated" : "Plan added"}. Asked ${curfew.who}.`);
            } catch (e) {
              snack(errorMessage(e));
            }
          }
          if (res.conflictIds.length) {
            // Stay open on the clashes, so they can be moved right away.
            setSaved(res);
            setEditing(false);
          } else {
            onClose();
            if (!curfew.ask) snack(current ? "Plan updated" : "Plan added");
          }
        },
        onError: (e) => snack(errorMessage(e)),
      },
    );
  }

  const valid = draft.title.trim() && (draft.allDay ? draft.endDay >= draft.startDay : draft.end > draft.start);

  if (!editing && current) {
    return (
      <Dialog
        open={open}
        onClose={onClose}
        title={current.title}
        actions={
          <>
            {mine && (
              <Button
                variant="text"
                className="mr-auto text-error"
                busy={del.isPending}
                onClick={() =>
                  del.mutate(current.id, {
                    onSuccess: () => {
                      onClose();
                      snack("Plan removed");
                    },
                    onError: (e) => snack(errorMessage(e)),
                  })
                }
              >
                Remove
              </Button>
            )}
            {mine && (
              <Button variant="text" onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
            {clashes.apply}
            <Button variant={clashes.apply ? "text" : "filled"} onClick={onClose}>
              Done
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-body-large text-on-surface">
            <Icon name="event" className="text-tertiary" />
            {eventWhen(current)}
          </div>
          <div className="text-body-medium">
            {current.withPartner ? "For both of you" : `For ${current.authorId === me.user.id ? "you" : memberName(current.authorId)}`} · added by{" "}
            {current.authorId === me.user.id ? "you" : memberName(current.authorId)}
          </div>
          {current.noteMd && <p className="rounded-sm bg-surface-container px-3 py-2 whitespace-pre-wrap">{current.noteMd}</p>}
          {curfew.waiting}
          {clashes.body}
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={current ? "Edit plan" : "New plan"}
      actions={
        <>
          <Button variant="text" onClick={current ? () => setEditing(false) : onClose}>
            Cancel
          </Button>
          <Button onClick={submit} busy={save.isPending} disabled={!valid}>
            {curfew.ask ? `Save and ask ${curfew.who}` : "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField label="What's the plan?" value={draft.title} onChange={(e) => set({ title: e.target.value })} maxLength={80} placeholder="Dinner with family" />
        <SegmentedButtons<"me" | "both">
          value={draft.withPartner ? "both" : "me"}
          onChange={(v) => set({ withPartner: v === "both" })}
          className="w-full"
          options={[
            { value: "me", label: "Just me" },
            { value: "both", label: partner ? `Me and ${partner}` : "Both of us" },
          ]}
        />
        <p className="-mt-2 px-1 text-body-small">{draft.withPartner ? "Both of your tasks are checked for clashes." : "Only your tasks are checked for clashes."}</p>
        <Switch checked={draft.allDay} onChange={(allDay) => set({ allDay })} label="All day" />
        {draft.allDay ? (
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="From"
              type="date"
              value={draft.startDay}
              onChange={(e) => e.target.value && set({ startDay: e.target.value, endDay: e.target.value > draft.endDay ? e.target.value : draft.endDay })}
            />
            <TextField label="Until" type="date" value={draft.endDay} min={draft.startDay} onChange={(e) => e.target.value && set({ endDay: e.target.value })} />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Starts"
              type="datetime-local"
              value={draft.start}
              onChange={(e) => {
                const start = e.target.value;
                if (!start) return;
                // Keep the length when the start moves, like any calendar.
                const length = new Date(draft.end).getTime() - new Date(draft.start).getTime();
                set({ start, end: toLocalInput(new Date(new Date(start).getTime() + Math.max(length, 3_600_000)).toISOString()) });
              }}
            />
            <TextField label="Ends" type="datetime-local" value={draft.end} min={draft.start} onChange={(e) => e.target.value && set({ end: e.target.value })} />
          </div>
        )}
        {curfew.form(set)}
        <TextArea label="Note (optional)" value={draft.note} onChange={(e) => set({ note: e.target.value })} maxLength={2000} rows={2} />
      </div>
    </Dialog>
  );
}

/**
 * A plan of mine that runs past one of my curfew nights: end it at curfew, or ask for that night's curfew to move to the
 * plan's end (sent once the plan is saved). Once a night is asked about, the plan shows it's waiting.
 */
function useCurfewWarning(active: boolean, draft: Draft, current: CalendarEvent | null) {
  const { rel, me, features } = useRel();
  const who = useAskWho();
  const curfewQ = useCurfew(rel.id, features.location);
  const settings = curfewQ.data?.settings;
  const onCurfew = !!settings?.enabled && settings.assigneeId === me.user.id;
  const startsAt = draft.allDay || !draft.start ? null : fromLocalInput(draft.start);
  const endsAt = draft.allDay || !draft.end ? null : fromLocalInput(draft.end);
  const check = useCurfewCheck(rel.id, startsAt, endsAt, active && onCurfew);
  const askCurfew = useAskCurfew(rel.id);
  const [choice, setChoice] = useState<"end" | "ask" | null>(null);
  const [reason, setReason] = useState("");
  // Remembered so "Ends at curfew" still shows once the plan no longer runs past it.
  const [endedAt, setEndedAt] = useState<string | null>(null);
  useEffect(() => {
    if (!active) {
      setChoice(null);
      setReason("");
      setEndedAt(null);
    }
  }, [active]);
  const pending = (curfewQ.data?.requests ?? []).find((r) => r.eventId && r.eventId === current?.id);
  const night = check.data?.night ?? null;
  const canAsk = !!night && !!endsAt && Date.parse(endsAt) < Date.parse(night.endsAt) && !pending;
  const asking = choice === "ask" && canAsk;

  const waiting = pending && (
    <div className="flex items-center gap-3 rounded-lg bg-surface-container px-4 py-3">
      <Icon name="hourglass_top" className="text-on-surface-variant" />
      <div>
        <div className="text-title-medium text-on-surface">Waiting on {who}</div>
        <div className="text-body-medium">
          You asked to move {fmtDate(localDateOf(new Date(Date.parse(pending.fromDueAt) - 12 * 3_600_000)), { weekday: "long" })}'s curfew from {fmtTime(pending.fromDueAt)} to{" "}
          {fmtTime(pending.untilAt)}
        </div>
      </div>
    </div>
  );

  function form(set: (p: Partial<Draft>) => void) {
    if (!onCurfew || draft.allDay) return null;
    if (pending) return waiting;
    if (!night) {
      if (!endedAt || draft.end !== toLocalInput(endedAt)) return null;
      return (
        <div className="flex items-start gap-3 rounded-lg bg-surface-container px-4 py-3">
          <Icon name="bedtime" className="text-on-surface-variant" />
          <div>
            <div className="text-title-small text-on-surface">Ends at curfew</div>
            <div className="text-body-medium">Curfew that night is {fmtTime(endedAt)}.</div>
          </div>
        </div>
      );
    }
    const past = Math.round((Date.parse(endsAt!) - Date.parse(night.dueAt)) / 60_000);
    const howLong = past < 60 ? `${past} min` : past % 60 ? `${(past / 60).toFixed(1)} hours` : past === 60 ? "an hour" : `${past / 60} hours`;
    const nightName = fmtDate(localDateOf(new Date(Date.parse(night.dueAt) - 12 * 3_600_000)), { weekday: "long" });
    return (
      <div className="flex flex-col gap-3 rounded-lg bg-error-container px-4 py-3 text-on-error-container">
        <div className="flex items-start gap-3">
          <Icon name="bedtime" />
          <div>
            <div className="text-title-small">Runs {howLong} past curfew</div>
            <div className="text-body-medium opacity-85">
              Curfew {nightName} is {fmtTime(night.dueAt)}.{!canAsk && ` It runs past the stay-in time (${fmtTime(night.endsAt)}), so end it earlier.`}
            </div>
          </div>
        </div>
        <SegmentedButtons<"end" | "ask" | "">
          value={asking ? "ask" : ""}
          onChange={(v) => {
            if (v === "end") {
              setEndedAt(night.dueAt);
              setChoice(null);
              set({ end: toLocalInput(night.dueAt) });
            } else if (v === "ask") setChoice("ask");
          }}
          className="w-full whitespace-nowrap"
          options={[{ value: "end", label: `End at ${fmtTime(night.dueAt)}` }, ...(canAsk ? [{ value: "ask" as const, label: `Ask until ${fmtTime(endsAt!)}` }] : [])]}
        />
        {asking && <TextField label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={280} />}
        {asking && (
          <p className="text-body-small">
            {who} is asked to move {nightName}'s curfew to {fmtTime(endsAt!)}. The plan is saved either way; if {who} says no, curfew stays at {fmtTime(night.dueAt)}.
          </p>
        )}
      </div>
    );
  }

  const ask = asking ? (eventId: string, until: string) => askCurfew.mutateAsync({ occurrenceId: night!.occurrenceId, until, reason: reason.trim() || null, eventId }) : null;
  return { form, ask, who, waiting: !active && waiting };
}

type ClashChoice = "keep" | "move" | "cancel";

/**
 * The tasks a plan runs into, each sorted out its own way: kept as it is (the clash is dismissed for both), moved to
 * after the plan, or called off. A Dominant's choices apply at once; a sub's moves and call-offs go out as one request
 * (moves may apply straight away, depending on the dynamic's rules).
 */
function useClashes(event: CalendarEvent | null): { body: ReactNode; apply: ReactNode } {
  const { rel, me, isDom, memberName } = useRel();
  const snack = useSnackbar();
  const from = event ? localDateOf(new Date(event.startsAt)) : today();
  const to = event ? localDateOf(new Date(event.endsAt)) : today();
  const occ = useOccurrences(rel.id, from, to);
  const plan = usePlanReschedule(rel.id);
  const dismiss = useDismissClashes(rel.id);
  const [choices, setChoices] = useState<Record<string, ClashChoice>>({});
  const [times, setTimes] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const none = { body: null, apply: null };
  if (!event?.conflictIds.length) return none;
  const items = (occ.data ?? []).filter((o) => event.conflictIds.includes(o.id) && o.status === "pending");
  if (!items.length && !occ.isLoading) return none;
  const subBlocked = !isDom && rel.reschedulePolicy === "dominant_only";
  const involved = event.withPartner || event.authorId === me.user.id;
  const canMove = (o: Occurrence) => !subBlocked && (isDom || o.assigneeId === me.user.id);
  const canAct = (o: Occurrence) => involved || canMove(o);
  const choiceOf = (o: Occurrence): ClashChoice | undefined => choices[o.id];
  const timeOf = (o: Occurrence) => times[o.id] ?? toLocalInput(afterEvent(o.dueAt, event));
  const picked = items.filter((o) => canAct(o) && choiceOf(o));
  const kept = picked.filter((o) => choiceOf(o) === "keep");
  const changed = picked.filter((o) => choiceOf(o) !== "keep");
  const asks = !isDom && changed.some((o) => choiceOf(o) === "cancel" || rel.reschedulePolicy !== "allowance");
  // One tap for the lot: a long plan can run into dozens of tasks.
  const actionable = items.filter(canAct);
  const allMovable = actionable.every(canMove);
  const allAre = (c: ClashChoice) => actionable.length > 0 && actionable.every((o) => choiceOf(o) === c);
  const setAll = (c: ClashChoice) => setChoices(allAre(c) ? {} : Object.fromEntries(actionable.map((o) => [o.id, c])));

  async function submit() {
    if (!event) return;
    try {
      if (kept.length) await dismiss.mutateAsync({ id: event.id, occurrenceIds: kept.map((o) => o.id) });
      if (!changed.length) {
        setChoices({});
        return snack(kept.length === 1 ? "Kept as it is" : `Kept ${kept.length} tasks as they are`);
      }
      const r = await plan.mutateAsync({
        items: changed.map((o) => (choiceOf(o) === "cancel" ? { occurrenceId: o.id, action: "cancel" } : { occurrenceId: o.id, action: "move", dueAt: fromLocalInput(timeOf(o)) })),
        ...(reason.trim() && { reason: reason.trim() }),
      });
      setChoices({});
      setReason("");
      snack(r.applied ? "Done" : r.requests.some((x) => x.status === "applied") ? "Moved what you could; the rest is waiting for approval" : "Sent for approval");
    } catch (e) {
      snack(errorMessage(e));
    }
  }

  const body = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-title-small text-error">
        <Icon name="warning" size={20} />
        {items.length === 1 ? "Overlaps a task" : `Overlaps ${items.length} tasks`}
      </div>
      {actionable.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <Chip icon="done_all" selected={allAre("keep")} onClick={() => setAll("keep")}>
            Keep all
          </Chip>
          {allMovable && (
            <>
              <Chip selected={allAre("move")} onClick={() => setAll("move")}>
                Move all after
              </Chip>
              <Chip selected={allAre("cancel")} onClick={() => setAll("cancel")}>
                {isDom ? "Call off all" : "Ask off all"}
              </Chip>
            </>
          )}
        </div>
      )}
      {items.map((o) => {
        const mine = o.assigneeId === me.user.id;
        const choice = choiceOf(o);
        return (
          <div key={o.id} className="flex flex-col gap-2 rounded-md bg-surface-container px-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-body-large text-on-surface">{o.title}</div>
              <div className="text-body-small">
                Due {fmtTime(o.dueAt)}
                {!mine && ` · ${memberName(o.assigneeId)}`}
              </div>
            </div>
            {canAct(o) && (
              <SegmentedButtons<ClashChoice | "">
                value={choice ?? ""}
                onChange={(v) => v && setChoices((c) => ({ ...c, [o.id]: v }))}
                className="w-full"
                options={[
                  { value: "keep", label: "Keep" },
                  ...(canMove(o)
                    ? [
                        { value: "move" as const, label: "Move" },
                        { value: "cancel" as const, label: isDom ? "Call off" : "Ask off" },
                      ]
                    : []),
                ]}
              />
            )}
            {choice === "move" && <TextField type="datetime-local" label="New deadline" value={timeOf(o)} onChange={(e) => setTimes((t) => ({ ...t, [o.id]: e.target.value }))} />}
          </div>
        );
      })}
      <p className="px-1 text-body-small">Keep means the task is fine alongside the plan, and it stops counting as a clash.</p>
      {subBlocked && <p className="px-1 text-body-small">Only your Dominant can move or call off tasks in this dynamic.</p>}
      {picked.length > 0 && asks && <TextField label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />}
    </div>
  );
  // In the dialog's own button row, so a long list doesn't need scrolling to the end.
  const apply = picked.length > 0 && (
    <Button icon={asks ? "send" : "check"} busy={plan.isPending || dismiss.isPending} onClick={() => void submit()}>
      {asks ? "Ask" : "Apply"} ({picked.length})
    </Button>
  );
  return { body, apply };
}
