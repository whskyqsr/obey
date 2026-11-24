import { useEffect, useState, type ReactNode } from "react";
import type { CalendarEvent, Occurrence } from "../api/types";
import { useAnswerPause, useAskCurfew, useCurfew, useCurfewCheck, useDeleteEvent, useDismissClashes, useOccurrences, usePlanReschedule, useSaveEvent } from "../api/hooks";
import { errorMessage } from "../api/client";
import { addDays, fmtDate, fmtTime, fromLocalInput, localDateOf, toLocalInput, today } from "../lib/dates";
import { useRel } from "../lib/relationship";
import { afterEvent } from "./RescheduleSheet";
import { useAskWho } from "./CurfewStrip";
import { createPortal } from "react-dom";
import { Button, Chip, Diamond, Dialog, Icon, SegmentedButtons, TextArea, TextField, cx, useSnackbar } from "./ui";

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

type Every = NonNullable<CalendarEvent["repeat"]>["every"];
type Draft = {
  title: string;
  allDay: boolean;
  withPartner: boolean;
  start: string;
  end: string;
  startDay: string;
  endDay: string;
  note: string;
  repeat: { every: Every; until: string } | null;
  pause: boolean;
  /** Editing one plan of a repeating plan: just it, or it and the ones after. */
  applyTo: "one" | "following";
};

const EVERY: Record<Every, string> = { day: "Every day", week: "Every week", "2weeks": "Every 2 weeks", month: "Every month" };
/** How far a new repeat runs before they pick an end. */
const DEFAULT_RUN: Record<Every, number> = { day: 13, week: 49, "2weeks": 98, month: 151 };

/** "Every week until Fri, Dec 18". */
export function repeatLine(r: { every: Every; until: string }) {
  return `${EVERY[r.every]} until ${fmtDate(r.until)}`;
}

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
      repeat: e.repeat ? { every: e.repeat.every, until: e.repeat.until } : null,
      pause: e.pauseTasks,
      applyTo: "one",
    };
  }
  // Evening by default; later today if the evening has started.
  const hour = day === today() ? Math.max(18, new Date().getHours() + 1) : 18;
  const at = (h: number) => (h < 24 ? `${day}T${String(h).padStart(2, "0")}:00` : `${addDays(day, 1)}T${String(h - 24).padStart(2, "0")}:00`);
  return { title: "", allDay: false, withPartner: false, start: at(hour), end: at(hour + 2), startDay: day, endDay: day, note: "", repeat: null, pause: false, applyTo: "one" };
}

/**
 * Adds, edits or shows a plan on the shared calendar. Either partner adds plans; each changes only their own.
 * Tasks due during the plan are listed underneath with a one-tap reschedule.
 */
export function EventDialog({ event, day, open, onClose }: { event: CalendarEvent | null; day?: string; open: boolean; onClose(): void }) {
  const { rel, me, memberName, isDom } = useRel();
  const who = useAskWho();
  const answer = useAnswerPause(rel.id);
  const [removing, setRemoving] = useState(false);
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
    setRemoving(false);
  }, [open, event, day]);

  const current = saved;
  const mine = !current || current.authorId === me.user.id;
  const curfew = useCurfewWarning(open && editing, draft, current);
  const clashes = useClashes(open && !editing ? current : null);
  const set = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));

  const times = draft.allDay
    ? { startsAt: fromLocalInput(`${draft.startDay}T00:00`), endsAt: fromLocalInput(`${addDays(draft.endDay, 1)}T00:00`) }
    : { startsAt: fromLocalInput(draft.start), endsAt: fromLocalInput(draft.end) };
  // A submissive's pause waits on a Dominant, again whenever the plan moves or takes in the partner.
  const moved = !!current && (Date.parse(current.startsAt) !== Date.parse(times.startsAt) || Date.parse(current.endsAt) !== Date.parse(times.endsAt));
  const asksPause =
    draft.pause && !isDom && (!current || !current.pauseTasks || current.pauseStatus === "declined" || moved || current.withPartner !== draft.withPartner);

  function submit() {
    const input = {
      title: draft.title,
      allDay: draft.allDay,
      withPartner: draft.withPartner,
      ...times,
      noteMd: draft.note.trim() || null,
      pauseTasks: draft.pause,
      ...(!current && draft.repeat ? { repeat: { ...draft.repeat, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } } : {}),
      ...(current?.seriesId ? { applyTo: draft.applyTo } : {}),
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
          } else if (res.pauseStatus === "asked" && asksPause) {
            snack(`${current ? "Plan updated" : "Plan added"}. Asked ${who}.`);
          }
          if (res.conflictIds.length) {
            // Stay open on the clashes, so they can be moved right away.
            setSaved(res);
            setEditing(false);
          } else {
            onClose();
            if (!curfew.ask && !(res.pauseStatus === "asked" && asksPause)) snack(current ? "Plan updated" : "Plan added");
          }
        },
        onError: (e) => snack(errorMessage(e)),
      },
    );
  }

  function remove(following: boolean) {
    del.mutate(
      { id: current!.id, following },
      {
        onSuccess: () => {
          onClose();
          snack(following ? "Plans removed" : "Plan removed");
        },
        onError: (e) => snack(errorMessage(e)),
      },
    );
  }

  function decide(approve: boolean) {
    answer.mutate(
      { id: current!.id, approve },
      { onSuccess: (res) => (setSaved(res), snack(approve ? "Tasks paused" : "Tasks stay on")), onError: (e) => snack(errorMessage(e)) },
    );
  }

  const valid = draft.title.trim() && (draft.allDay ? draft.endDay >= draft.startDay : draft.end > draft.start);

  if (!editing && current) {
    // A plan that runs into tasks opens on them first (mockup 58).
    if (clashes.body)
      return (
        <Dialog open={open} onClose={onClose} title={<span className="font-serif text-[32px] leading-tight">{clashes.title}</span>}>
          {clashes.body}
          {mine && (
            <div className="flex justify-center pb-2">
              <Button variant="plain" onClick={() => setEditing(true)}>
                Change the plan
              </Button>
            </div>
          )}
        </Dialog>
      );
    return (
      <Dialog
        open={open}
        onClose={onClose}
        title={<span className="font-serif text-[32px] leading-tight">{current.title}</span>}
        actions={
          <>
            {mine && removing && current.seriesId ? (
              <>
                <Button variant="outlined" busy={del.isPending} onClick={() => remove(false)}>
                  This one
                </Button>
                <Button variant="outlined" busy={del.isPending} onClick={() => remove(true)}>
                  This and later ones
                </Button>
                <Button variant="plain" onClick={() => setRemoving(false)}>
                  Back
                </Button>
              </>
            ) : (
              mine && (
                <Button variant="text" className="mr-auto text-error" busy={del.isPending} onClick={() => (current.seriesId ? setRemoving(true) : remove(false))}>
                  Remove
                </Button>
              )
            )}
            {mine && !removing && (
              <Button variant="outlined" onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
            {!removing && <Button onClick={onClose}>Done</Button>}
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="-mt-2 text-body-large text-on-surface-variant">
            {eventWhen(current)}
            {current.withPartner ? " · both of you" : ""}
          </div>
          {current.repeat && <div className="-mt-3 text-body-medium text-on-surface-variant">{repeatLine(current.repeat)}</div>}
          {current.noteMd && <p className="border-l-2 border-outline-variant pl-3 whitespace-pre-wrap text-on-surface">{current.noteMd}</p>}
          {current.pauseTasks && <PauseLine e={current} mine={mine} who={who} author={memberName(current.authorId)} />}
          {!mine && isDom && current.pauseStatus === "asked" && (
            <div className="flex gap-2">
              <Button busy={answer.isPending} onClick={() => decide(true)}>
                Pause them
              </Button>
              <Button variant="outlined" disabled={answer.isPending} onClick={() => decide(false)}>
                Not now
              </Button>
            </div>
          )}
          {curfew.waiting}
        </div>
      </Dialog>
    );
  }

  if (!open) return null;
  return (
    <PlanEditor
      draft={draft}
      set={set}
      title={current ? "Edit plan" : "New plan"}
      partner={partner}
      curfew={curfew}
      isNew={!current}
      repeating={!!current?.seriesId}
      ask={curfew.ask ? curfew.who : asksPause ? who : null}
      busy={save.isPending}
      valid={!!valid}
      onCancel={current ? () => setEditing(false) : onClose}
      onSave={submit}
    />
  );
}

type Slot = "day" | "start" | "end" | "from" | "until" | "repeat";

/** "7:00" before "11:30 PM", "11 AM" before "1:00 PM": the first time drops its AM/PM when the second has the same. */
function timePair(startIso: string, endIso: string) {
  const a = fmtTime(startIso);
  const b = fmtTime(endIso);
  return a.slice(-2) === b.slice(-2) ? [a.slice(0, -3), b] : [a, b];
}

/** "today", "tomorrow", "Friday" within the week, else "Fri, Dec 4". */
function dayWord(d: string) {
  if (d === today()) return "today";
  if (d === addDays(today(), 1)) return "tomorrow";
  if (d > today() && d < addDays(today(), 7)) return fmtDate(d, { weekday: "long" });
  return fmtDate(d);
}

/** Whether a plan's tasks are paused, waiting on a Dominant, or turned down. */
function PauseLine({ e, mine, who, author }: { e: CalendarEvent; mine: boolean; who: string; author: string }) {
  const text =
    e.pauseStatus === "approved"
      ? "Tasks during it are paused."
      : e.pauseStatus === "asked"
        ? mine
          ? `Waiting for ${who} to pause tasks during it.`
          : `${author} asks to pause tasks during it.`
        : `${mine ? who : "You"} said no to pausing tasks during it.`;
  return <div className="text-body-medium text-on-surface-variant">{text}</div>;
}

/**
 * The plan editor (mockup 14): full screen, the plan as one sentence with tappable parts ("I'll be at ___ on ___ from ___
 * to ___."), a curfew notice when it runs late, what else it is, and the buttons at the bottom.
 */
function PlanEditor({
  draft,
  set,
  title,
  partner,
  curfew,
  isNew,
  repeating,
  ask,
  busy,
  valid,
  onCancel,
  onSave,
}: {
  draft: Draft;
  set(p: Partial<Draft>): void;
  title: string;
  partner: string | null;
  curfew: ReturnType<typeof useCurfewWarning>;
  isNew: boolean;
  repeating: boolean;
  /** Who saving asks, about curfew or paused tasks. */
  ask: string | null;
  busy: boolean;
  valid: boolean;
  onCancel(): void;
  onSave(): void;
}) {
  const [panel, setPanel] = useState<Slot | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onCancel]);
  const toggle = (p: Slot) => setPanel((o) => (o === p ? null : p));
  const slot = (p: Slot, text: ReactNode, label: string) => (
    <button
      type="button"
      aria-label={label}
      aria-expanded={panel === p}
      onClick={() => toggle(p)}
      className={cx("border-b-[1.5px] border-primary text-left transition-colors", panel === p ? "bg-primary-container/60" : "hover:bg-primary-container/30")}
    >
      {text}
    </button>
  );
  const day = draft.start.slice(0, 10);
  const startTime = draft.start.slice(11, 16);
  const endTime = draft.end.slice(11, 16);
  // The end is always the first time after the start: 1:00 AM after 7:00 PM is the next day.
  const setTimes = (start: string, end: string, d = day) => set({ start: `${d}T${start}`, end: `${end > start ? d : addDays(d, 1)}T${end}` });
  const [a, b] = timePair(fromLocalInput(draft.start), fromLocalInput(draft.end));
  const nextDay = draft.end.slice(0, 10) > day;

  const done = (
    <div className="flex justify-end pt-2">
      <Button variant="text" onClick={() => setPanel(null)}>
        Done
      </Button>
    </div>
  );
  const dayPanel = (value: string, pick: (d: string) => void) => (
    <div className="flex flex-col gap-4 py-3">
      <div className="flex flex-wrap gap-2">
        {[today(), addDays(today(), 1)].map((d) => (
          <Chip key={d} plain selected={value === d} onClick={() => (pick(d), setPanel(null))}>
            {d === today() ? "Today" : "Tomorrow"}
          </Chip>
        ))}
      </div>
      <TextField label="Date" type="date" value={value} onChange={(e) => e.target.value && pick(e.target.value)} className="w-48" />
      {done}
    </div>
  );
  const timePanel = (label: string, value: string, pick: (t: string) => void) => (
    <div className="flex flex-col gap-4 py-3">
      <TextField label={label} type="time" value={value} onChange={(e) => e.target.value && pick(e.target.value)} className="w-40" />
      {done}
    </div>
  );
  const panels: Record<Slot, () => ReactNode> = {
    day: () => dayPanel(day, (d) => setTimes(startTime, endTime, d)),
    start: () =>
      timePanel("Starts", startTime, (t) => {
        // Keep the length when the start moves, like any calendar.
        const length = new Date(draft.end).getTime() - new Date(draft.start).getTime();
        const end = toLocalInput(new Date(new Date(`${day}T${t}`).getTime() + Math.max(length, 3_600_000)).toISOString());
        set({ start: `${day}T${t}`, end });
      }),
    end: () => timePanel("Ends", endTime, (t) => setTimes(startTime, t)),
    from: () => (
      <div className="flex flex-col gap-4 py-3">
        <div className="grid max-w-md grid-cols-2 gap-4">
          <TextField
            label="From"
            type="date"
            value={draft.startDay}
            onChange={(e) => e.target.value && set({ startDay: e.target.value, endDay: e.target.value > draft.endDay ? e.target.value : draft.endDay })}
          />
          <TextField label="Until" type="date" value={draft.endDay} min={draft.startDay} onChange={(e) => e.target.value && set({ endDay: e.target.value })} />
        </div>
        {done}
      </div>
    ),
    until: () => dayPanel(draft.endDay, (d) => d >= draft.startDay && set({ endDay: d })),
    repeat: () => {
      const first = draft.allDay ? draft.startDay : day;
      const pick = (every: Every) => set({ repeat: { every, until: draft.repeat && draft.repeat.until >= first ? draft.repeat.until : addDays(first, DEFAULT_RUN[every]) } });
      return (
        <div className="flex flex-col gap-4 py-3">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(EVERY) as Every[]).map((k) => (
              <Chip key={k} plain selected={draft.repeat?.every === k} onClick={() => pick(k)}>
                {EVERY[k]}
              </Chip>
            ))}
          </div>
          {draft.repeat && (
            <TextField
              label="Until"
              type="date"
              value={draft.repeat.until}
              min={first}
              onChange={(e) => e.target.value && set({ repeat: { ...draft.repeat!, until: e.target.value } })}
              className="w-48"
            />
          )}
          <div className="flex justify-between pt-2">
            <Button variant="plain" onClick={() => (set({ repeat: null }), setPanel(null))}>
              Doesn't repeat
            </Button>
            <Button variant="text" onClick={() => setPanel(null)}>
              Done
            </Button>
          </div>
        </div>
      );
    },
  };

  const what = (
    <span className="inline-grid max-w-full align-baseline">
      <span aria-hidden className="invisible col-start-1 row-start-1 overflow-hidden pr-1 whitespace-pre">
        {draft.title || "what"}
      </span>
      <input
        aria-label="What's the plan?"
        data-field
        size={1}
        value={draft.title}
        onChange={(e) => set({ title: e.target.value })}
        placeholder="what"
        maxLength={80}
        autoFocus={!draft.title}
        className="col-start-1 row-start-1 w-full min-w-[4ch] border-b-[1.5px] border-primary bg-transparent p-0 text-inherit outline-none placeholder:text-on-surface-variant/50"
      />
    </span>
  );

  const sentence = (
    <p className="font-serif text-[34px] leading-[1.3] tracking-[-0.01em] text-on-surface md:text-[44px]">
      {draft.withPartner ? "We'll" : "I'll"} be at {what}{" "}
      {draft.allDay ? (
        draft.startDay === draft.endDay ? (
          <>
            {draft.startDay === today() || draft.startDay === addDays(today(), 1) ? "" : "on "}
            {slot("from", dayWord(draft.startDay), "Days")}, all day.
          </>
        ) : (
          <>
            from {slot("from", dayWord(draft.startDay), "Days")} to {slot("until", dayWord(draft.endDay), "Last day")}.
          </>
        )
      ) : (
        <>
          {day === today() || day === addDays(today(), 1) ? "" : "on "}
          {slot("day", dayWord(day), "Day")} from {slot("start", a, "Starts")} to {slot("end", b, "Ends")}
          {nextDay ? " the next day" : ""}.
        </>
      )}
    </p>
  );

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex flex-col bg-surface text-on-surface">
      <div className="relative flex h-14 shrink-0 items-center justify-center px-4 md:px-8">
        <button type="button" onClick={onCancel} className="state-layer absolute left-2 rounded-sm px-3 py-2 text-body-large text-on-surface-variant md:left-6">
          Cancel
        </button>
        <h2 className="text-title-medium">{title}</h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[720px] flex-col gap-6 px-6 pt-6 pb-10 md:pt-12">
          {sentence}
          {panel && <div className="rounded-md border border-outline-variant bg-surface-container-lowest px-4">{panels[panel]()}</div>}
          {curfew.notice}
          <section>
            <h3 className="eyebrow mb-3">Also</h3>
            <div className="flex flex-wrap gap-2">
              {partner && (
                <Chip selected={draft.withPartner} onClick={() => set({ withPartner: !draft.withPartner })}>
                  With {partner}
                </Chip>
              )}
              <Chip
                selected={draft.allDay}
                onClick={() => (setPanel(null), set(draft.allDay ? { allDay: false } : { allDay: true, startDay: day, endDay: draft.endDay < day ? day : draft.endDay }))}
              >
                All day
              </Chip>
              {isNew && (
                <Chip selected={!!draft.repeat} onClick={() => (draft.repeat ? toggle("repeat") : (set({ repeat: { every: "week", until: addDays(draft.allDay ? draft.startDay : day, DEFAULT_RUN.week) } }), setPanel("repeat")))}>
                  {draft.repeat ? repeatLine(draft.repeat) : "Repeats"}
                </Chip>
              )}
              <Chip selected={draft.pause} onClick={() => set({ pause: !draft.pause })}>
                Pause tasks during it
              </Chip>
            </div>
          </section>
          {repeating && (
            <section>
              <h3 className="eyebrow mb-3">Change</h3>
              <div className="flex flex-wrap gap-2">
                <Chip plain selected={draft.applyTo === "one"} onClick={() => set({ applyTo: "one" })}>
                  This one
                </Chip>
                <Chip plain selected={draft.applyTo === "following"} onClick={() => set({ applyTo: "following" })}>
                  This and later ones
                </Chip>
              </div>
            </section>
          )}
          <TextArea label="Note (optional)" value={draft.note} onChange={(e) => set({ note: e.target.value })} maxLength={2000} rows={2} />
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-[720px] shrink-0 gap-3 px-6 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {curfew.endAt && (
          <Button variant="outlined" className="h-12 flex-1" onClick={() => curfew.endAt!(set)}>
            End at {curfew.endLabel}
          </Button>
        )}
        <Button className="h-12 flex-[1.3]" onClick={onSave} busy={busy} disabled={!valid}>
          {ask ? `Save and ask ${ask}` : "Save"}
        </Button>
      </div>
    </div>,
    document.body,
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
  const [reason, setReason] = useState("");
  // Remembered so "Ends at curfew" still shows once the plan no longer runs past it.
  const [endedAt, setEndedAt] = useState<string | null>(null);
  useEffect(() => {
    if (!active) {
      setReason("");
      setEndedAt(null);
    }
  }, [active]);
  const pending = (curfewQ.data?.requests ?? []).find((r) => r.eventId && r.eventId === current?.id);
  const night = check.data?.night ?? null;
  const canAsk = !!night && !!endsAt && Date.parse(endsAt) < Date.parse(night.endsAt) && !pending;
  // Running past curfew asks by default (mockup 14); "End at" pulls the plan back to curfew instead.
  const asking = onCurfew && !draft.allDay && canAsk;

  const waiting = pending && (
    <div className="border-l-2 border-outline-variant pl-3">
      <div className="text-body-large text-on-surface">Waiting on {who}</div>
      <div className="text-body-medium text-on-surface-variant">
        You asked to move {fmtDate(localDateOf(new Date(Date.parse(pending.fromDueAt) - 12 * 3_600_000)), { weekday: "long" })}'s curfew from {fmtTime(pending.fromDueAt)} to{" "}
        {fmtTime(pending.untilAt)}
      </div>
    </div>
  );

  let notice: ReactNode = null;
  if (onCurfew && !draft.allDay) {
    if (pending) notice = waiting;
    else if (!night) {
      if (endedAt && draft.end === toLocalInput(endedAt)) notice = <p className="text-body-medium text-on-surface-variant">Ends at curfew, {fmtTime(endedAt)}.</p>;
    } else {
      const past = Math.round((Date.parse(endsAt!) - Date.parse(night.dueAt)) / 60_000);
      const howLong = past < 60 ? `${past} minutes` : past % 60 ? `${(past / 60).toFixed(1)} hours` : past === 60 ? "an hour" : `${past / 60} hours`;
      notice = (
        <>
          <div className="flex items-start gap-4 rounded-md border border-primary bg-surface-container-lowest px-5 py-4">
            <Icon name="home" className="mt-0.5 shrink-0 text-primary" />
            <p className="text-body-large text-on-surface">
              This runs {howLong} past your {fmtTime(night.dueAt).replace(":00", "")} curfew.{" "}
              {canAsk
                ? `${who} will be asked, and can approve it or pick another end time.`
                : `It runs past the stay-in time (${fmtTime(night.endsAt)}), so end it earlier.`}
            </p>
          </div>
          {asking && <TextField label={`Why, for ${who} (optional)`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={280} />}
        </>
      );
    }
  }

  const endAt = night && onCurfew && !draft.allDay && !pending ? (set: (p: Partial<Draft>) => void) => (setEndedAt(night.dueAt), set({ end: toLocalInput(night.dueAt) })) : null;
  const ask = asking ? (eventId: string, until: string) => askCurfew.mutateAsync({ occurrenceId: night!.occurrenceId, until, reason: reason.trim() || null, eventId }) : null;
  return { notice, endAt, endLabel: night ? fmtTime(night.dueAt).replace(" PM", "").replace(" AM", "") : "", ask, who, waiting: !active && waiting };
}

type ClashChoice = "keep" | "move" | "cancel";

/**
 * The tasks a plan runs into, each sorted out its own way: kept as it is (the clash is dismissed for both), moved to
 * after the plan, or called off. A Dominant's choices apply at once; a sub's moves and call-offs go out as one request
 * (moves may apply straight away, depending on the dynamic's rules).
 */
function useClashes(event: CalendarEvent | null): { title: string; body: ReactNode; apply: ReactNode } {
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
  const [picking, setPicking] = useState(false);
  const none = { title: "", body: null, apply: null };
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
      setPicking(false);
      snack(r.applied ? "Done" : r.requests.some((x) => x.status === "applied") ? "Moved what you could; the rest is waiting for approval" : "Sent for approval");
    } catch (e) {
      snack(errorMessage(e));
    }
  }

  const n = items.length;
  const title = n === 1 ? "A task falls during this plan" : `${NUMBER_WORDS[n] ?? n} tasks fall during this plan`;
  const after = fmtTime(event.endsAt);
  const dom = rel.members.find((m) => m.role === "dominant" && m.userId !== me.user.id);
  const asksAboutMoves = !isDom && rel.reschedulePolicy !== "allowance" && !subBlocked;

  async function all(c: "keep" | "move") {
    if (!event) return;
    try {
      if (c === "keep") {
        await dismiss.mutateAsync({ id: event.id, occurrenceIds: actionable.map((o) => o.id) });
        return snack(actionable.length === 1 ? "Kept as it is" : "Kept as they are");
      }
      const r = await plan.mutateAsync({ items: actionable.map((o) => ({ occurrenceId: o.id, action: "move", dueAt: afterEvent(o.dueAt, event) })) });
      snack(r.applied ? "Moved" : r.requests.some((x) => x.status === "applied") ? "Moved what you could; the rest is waiting for approval" : "Sent for approval");
    } catch (e) {
      snack(errorMessage(e));
    }
  }

  const rows = items.map((o) => {
    const mine = o.assigneeId === me.user.id;
    const choice = choiceOf(o);
    return (
      <div key={o.id} className="flex flex-col gap-3 border-b border-outline-variant py-3">
        <div className="flex items-center gap-4">
          <Diamond size={16} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-body-large text-on-surface">{o.title}</div>
            <div className="text-body-medium text-on-surface-variant">
              {fmtTime(o.dueAt)}
              {!mine && ` · ${memberName(o.assigneeId)}`}
            </div>
          </div>
        </div>
        {picking && canAct(o) && (
          <div className="flex flex-wrap gap-2 pl-8">
            <Chip plain selected={choice === "keep"} onClick={() => setChoices((c) => ({ ...c, [o.id]: "keep" }))}>
              Keep
            </Chip>
            {canMove(o) && (
              <>
                <Chip plain selected={choice === "move"} onClick={() => setChoices((c) => ({ ...c, [o.id]: "move" }))}>
                  Move
                </Chip>
                <Chip plain selected={choice === "cancel"} onClick={() => setChoices((c) => ({ ...c, [o.id]: "cancel" }))}>
                  {isDom ? "Call off" : "Ask off"}
                </Chip>
              </>
            )}
          </div>
        )}
        {picking && choice === "move" && (
          <div className="pl-8">
            <TextField type="datetime-local" label="New time" value={timeOf(o)} onChange={(e) => setTimes((t) => ({ ...t, [o.id]: e.target.value }))} />
          </div>
        )}
      </div>
    );
  });

  const busy = plan.isPending || dismiss.isPending;
  const body = (
    <div className="flex flex-col">
      <p className="-mt-2 mb-2 text-body-large text-on-surface-variant">
        {event.title} · {eventWhen(event)}
      </p>
      {rows}
      <div className="mt-5 flex flex-col gap-3">
        {!picking ? (
          <>
            {allMovable && actionable.length > 0 && (
              <Button className="h-12 w-full" busy={busy} onClick={() => void all("move")}>
                Move {n === 1 ? "it" : "them"} to after {after}
              </Button>
            )}
            {allMovable && actionable.length > 0 && (
              <Button variant="outlined" className="h-12 w-full" onClick={() => setPicking(true)}>
                {n === 1 ? "Pick a new time" : "Pick new times one by one"}
              </Button>
            )}
            {actionable.length > 0 && (
              <Button variant="plain" className="h-12 w-full" busy={busy && !allMovable} onClick={() => void all("keep")}>
                Keep {n === 1 ? "it as it is" : "them as they are"}
              </Button>
            )}
          </>
        ) : (
          <>
            {picked.length > 0 && asks && <TextField label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />}
            <Button className="h-12 w-full" disabled={!picked.length} busy={busy} onClick={() => void submit()}>
              {asks ? "Ask" : "Save"}
              {picked.length ? ` (${picked.length})` : ""}
            </Button>
            <Button variant="plain" className="h-12 w-full" onClick={() => (setPicking(false), setChoices({}))}>
              Back
            </Button>
          </>
        )}
      </div>
      {asksAboutMoves && dom && <p className="mt-3 text-center text-body-small text-on-surface-variant">{dom.displayName} is asked about any move, unless your dynamic lets you.</p>}
      {subBlocked && <p className="mt-3 text-center text-body-small text-on-surface-variant">Only {dom?.displayName ?? "your Dominant"} can move tasks in this dynamic.</p>}
    </div>
  );
  return { title, body, apply: null };
}

const NUMBER_WORDS: Record<number, string> = { 2: "Two", 3: "Three", 4: "Four", 5: "Five", 6: "Six", 7: "Seven", 8: "Eight", 9: "Nine", 10: "Ten" };
