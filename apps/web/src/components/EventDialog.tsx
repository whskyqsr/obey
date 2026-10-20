import { useEffect, useState } from "react";
import type { CalendarEvent, Occurrence } from "../api/types";
import { useDeleteEvent, useOccurrences, useSaveEvent } from "../api/hooks";
import { errorMessage } from "../api/client";
import { addDays, fmtDate, fmtTime, fromLocalInput, localDateOf, toLocalInput, today } from "../lib/dates";
import { useRel } from "../lib/relationship";
import { RescheduleSheet } from "./RescheduleSheet";
import { Button, Dialog, Icon, SegmentedButtons, Switch, TextArea, TextField, useSnackbar } from "./ui";

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
        onSuccess: (res) => {
          if (res.conflictIds.length) {
            // Stay open on the clashes, so they can be moved right away.
            setSaved(res);
            setEditing(false);
          } else {
            onClose();
            snack(current ? "Plan updated" : "Plan added");
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
            <Button onClick={onClose}>Done</Button>
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
          <Clashes event={current} />
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
            Save
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
        <TextArea label="Note (optional)" value={draft.note} onChange={(e) => set({ note: e.target.value })} maxLength={2000} rows={2} />
      </div>
    </Dialog>
  );
}

/** The tasks a plan runs into, each with the reschedule its viewer is allowed. */
function Clashes({ event }: { event: CalendarEvent }) {
  const { rel, me, isDom, memberName } = useRel();
  const from = localDateOf(new Date(event.startsAt));
  const to = localDateOf(new Date(event.endsAt));
  const occ = useOccurrences(rel.id, from, to);
  const [moving, setMoving] = useState<Occurrence | null>(null);
  if (!event.conflictIds.length) return null;
  const items = (occ.data ?? []).filter((o) => event.conflictIds.includes(o.id) && o.status === "pending");
  if (!items.length && !occ.isLoading) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-title-small text-error">
        <Icon name="warning" size={20} />
        {items.length === 1 ? "Overlaps a task" : `Overlaps ${items.length} tasks`}
      </div>
      {items.map((o) => {
        const mine = o.assigneeId === me.user.id;
        return (
          <div key={o.id} className="flex items-center gap-3 rounded-md bg-surface-container px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-body-large text-on-surface">{o.title}</div>
              <div className="text-body-small">
                Due {fmtTime(o.dueAt)}
                {!mine && ` · ${memberName(o.assigneeId)}`}
              </div>
            </div>
            {(mine || isDom) && (
              <Button variant="tonal" icon="more_time" onClick={() => setMoving(o)}>
                {mine && !isDom ? "More time" : "Reschedule"}
              </Button>
            )}
          </div>
        );
      })}
      {moving && <RescheduleSheet occurrence={moving} open onClose={() => setMoving(null)} after={event} />}
    </div>
  );
}
