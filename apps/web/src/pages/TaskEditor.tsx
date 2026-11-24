import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useLibrary, usePlaces, useSaveTask, useTasks } from "../api/hooks";
import { PlaceDialog } from "../components/PlaceMap";
import { AskLocationButton } from "./Places";
import { errorMessage } from "../api/client";
import type { Task, TaskInput, TaskStep } from "../api/types";
import { RecurrencePicker } from "../components/RecurrencePicker";
import { SortableList } from "../components/SortableList";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { Button, Chip, Diamond, Dialog, ErrorBox, IconButton, Loading, Select, TextField, cx, useSnackbar } from "../components/ui";
import { type PickerState, defaultPicker, fromSchedule, preview, toSchedule } from "../recurrence/picker";
import { browserTimeZone, fmtClock, fmtDate, localDateOf, today } from "../lib/dates";
import { addDays } from "@obey/recurrence";
import { useMediaQuery } from "../lib/useMediaQuery";
import { ROLE_LABEL, useRel } from "../lib/relationship";
import { useBack } from "../lib/useBack";

interface Form {
  title: string;
  bodyMd: string;
  assigneeId: string;
  points: number;
  missPenalty: number;
  rewardId: string;
  consequenceId: string;
  consequenceDueDays: number;
  consequenceAllDay: boolean;
  consequenceDueTime: string;
  proofRequired: boolean;
  approvalRequired: boolean;
  picker: PickerState;
  /** A quick deadline, in minutes from now; the due time is worked out again on save. */
  quick: number | null;
  allDay: boolean;
  dueTime: string;
  timezone: string;
  grace: Grace;
  graceMinutes: number;
  steps: TaskStep[];
  windowMinutes: number | null;
  askMood: boolean;
  asksJournal: boolean;
  counted: boolean;
  countKind: CountKind;
  countN: number;
  countTo: number;
  countPer: "task" | "count";
  placeId: string;
  stayMinutes: number | null;
  reminder: Reminder;
  reminderText: string;
}

type Reminder = "default" | "custom" | "none";

type CountKind = "exactly" | "atLeast" | "atMost" | "range";

function countKindOf(t: Task | undefined): CountKind {
  if (t?.countMin != null && t.countMax != null) return t.countMin === t.countMax ? "exactly" : "range";
  if (t?.countMax != null) return "atMost";
  return t?.countMin != null ? "atLeast" : "exactly";
}

/** Grace chips. "midnight" follows the due time, so moving the time keeps it meaning "until midnight". */
type Grace = "none" | "15" | "60" | "midnight" | "custom";

const minutesOf = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const toMidnight = (dueTime: string) => 24 * 60 - minutesOf(dueTime);

const atMostOf = (f: Pick<Form, "counted" | "countKind">) => f.counted && f.countKind === "atMost";

const QUICK = [15, 30, 60, 120];
const quickLabel = (m: number) => (m < 60 ? `${m} min` : m === 60 ? "1 hour" : `${m / 60} hours`);

/** "Due in 30 min": a one-off task due that long from now (to the next whole minute), with no grace period. */
function quickDeadline(minutes: number): Partial<Form> {
  const due = new Date(Math.ceil((Date.now() + minutes * 60_000) / 60_000) * 60_000);
  const hhmm = `${String(due.getHours()).padStart(2, "0")}:${String(due.getMinutes()).padStart(2, "0")}`;
  return {
    quick: minutes,
    picker: defaultPicker(localDateOf(due)),
    allDay: false,
    dueTime: hhmm,
    timezone: browserTimeZone(),
    windowMinutes: null,
    grace: "none",
    graceMinutes: 0,
  };
}

function graceOf(task: Task | undefined): Grace {
  const g = task?.graceMinutes ?? 0;
  if (g === 0) return "none";
  if (g === 15) return "15";
  if (g === 60) return "60";
  if (task?.dueTime && g === toMidnight(task.dueTime)) return "midnight";
  return "custom";
}

function graceMinutes(f: Form): number {
  switch (f.grace) {
    case "none":
      return 0;
    case "15":
      return 15;
    case "60":
      return 60;
    case "midnight":
      return f.allDay ? 0 : toMidnight(f.dueTime || "00:00");
    case "custom":
      return Number.isFinite(f.graceMinutes) ? Math.max(0, Math.trunc(f.graceMinutes)) : 0;
  }
}

function formFrom(task: Task | undefined, defaultAssignee: string, start?: string): Form {
  return {
    title: task?.title ?? "",
    bodyMd: task?.bodyMd ?? "",
    assigneeId: task?.assigneeId ?? defaultAssignee,
    points: task?.points ?? 5,
    missPenalty: task?.missPenalty ?? 0,
    rewardId: task?.rewardId ?? "",
    consequenceId: task?.consequenceId ?? "",
    consequenceDueDays: task?.consequenceDueDays ?? 1,
    consequenceAllDay: task ? task.consequenceDueTime === null : true,
    consequenceDueTime: task?.consequenceDueTime ?? "21:00",
    proofRequired: task?.proofRequired ?? false,
    approvalRequired: task?.approvalRequired ?? false,
    // From a calendar day it's a one-off on that day, like a new calendar event; otherwise daily from today.
    picker: task ? fromSchedule(task.schedule) : start ? defaultPicker(start) : { ...defaultPicker(today()), kind: "days" },
    quick: null,
    allDay: task ? task.dueTime === null : false,
    dueTime: task?.dueTime ?? "21:00",
    timezone: task?.timezone ?? browserTimeZone(),
    grace: graceOf(task),
    graceMinutes: task?.graceMinutes ?? 0,
    steps: task?.steps ?? [],
    windowMinutes: task?.windowMinutes ?? null,
    askMood: task?.askMood ?? false,
    asksJournal: task?.asksJournal ?? false,
    counted: task ? task.countMin != null || task.countMax != null : false,
    countKind: countKindOf(task),
    countN: task?.countMin ?? task?.countMax ?? 3,
    countTo: task?.countMax ?? 5,
    countPer: task?.countPer ?? "task",
    placeId: task?.placeId ?? "",
    stayMinutes: task?.stayMinutes ?? null,
    reminder: task?.reminder ?? "default",
    reminderText: task?.reminderText ?? "",
  };
}

const whole = (n: number, min = 1) => (Number.isFinite(n) ? Math.min(1000, Math.max(min, Math.trunc(n))) : min);

/** The count bounds the form describes; both null for an ordinary task. */
function countBoundsOf(f: Form): { countMin: number | null; countMax: number | null } {
  if (!f.counted) return { countMin: null, countMax: null };
  const n = whole(f.countN);
  switch (f.countKind) {
    case "exactly":
      return { countMin: n, countMax: n };
    case "atLeast":
      return { countMin: n, countMax: null };
    case "atMost":
      return { countMin: null, countMax: n };
    case "range":
      return { countMin: n, countMax: whole(f.countTo, n) };
  }
}

function toInput(f: Form): TaskInput {
  return {
    title: f.title.trim(),
    bodyMd: f.bodyMd,
    assigneeId: f.assigneeId,
    points: Number.isFinite(f.points) ? Math.trunc(f.points) : 0,
    missPenalty: Number.isFinite(f.missPenalty) ? Math.max(0, Math.trunc(f.missPenalty)) : 0,
    rewardId: f.rewardId || null,
    consequenceId: f.consequenceId || null,
    consequenceDueDays: f.consequenceDueDays,
    consequenceDueTime: f.consequenceAllDay ? null : f.consequenceDueTime || null,
    // "At most" counts are sent at the deadline, so they take approval but not proof, a mood or an entry.
    proofRequired: f.proofRequired && !atMostOf(f),
    approvalRequired: f.approvalRequired,
    schedule: toSchedule(f.picker),
    dueTime: f.allDay ? null : f.dueTime || null,
    timezone: f.timezone,
    graceMinutes: graceMinutes(f),
    steps: f.steps.map((s) => ({ ...s, title: s.title.trim() })).filter((s) => s.title),
    // A window counts back from a due time, so an all-day task has none.
    windowMinutes: f.allDay ? null : f.windowMinutes,
    askMood: f.askMood && !atMostOf(f),
    asksJournal: f.asksJournal && !atMostOf(f),
    ...countBoundsOf(f),
    countPer: f.countPer,
    placeId: f.placeId || null,
    stayMinutes: f.placeId ? f.stayMinutes : null,
    reminder: f.reminder === "custom" && !f.reminderText.trim() ? "default" : f.reminder,
    reminderText: f.reminder === "custom" ? f.reminderText.trim() || null : null,
  };
}

const WINDOWS = [null, 15, 30, 60, 120, 240];
const windowLabel = (m: number | null) => (m === null ? "Any time" : m < 60 ? `${m} min before` : `${m / 60} hour${m === 60 ? "" : "s"} before`);

const dueDaysLabel = (d: number) => (d === 0 ? "Same day" : d === 1 ? "Next day" : `${d} days later`);

const num = (v: string) => (v === "" ? NaN : Number(v));

export function TaskEditorPage({ taskId, start }: { taskId: string; start?: string }) {
  const { rel, isDom, me } = useRel();
  const tasks = useTasks(rel.id);
  const isNew = taskId === "new";
  const task = tasks.data?.find((t) => t.id === taskId);
  if (!isNew && tasks.isLoading) return <Loading />;
  if (!isNew && tasks.error) return <ErrorBox error={tasks.error} onRetry={() => tasks.refetch()} />;
  if (!isNew && !task) return <ErrorBox error="That task doesn't exist any more." />;
  const defaultAssignee = rel.members.find((m) => m.role === "submissive" && m.userId !== me.user.id)?.userId ?? me.user.id;
  return <Editor key={taskId} task={task} readOnly={!isDom} defaultAssignee={defaultAssignee} start={start} />;
}

/** "America/New_York" → "New York". */
const tzName = (tz: string) => tz.split("/").pop()!.replace(/_/g, " ");

/** "9:15 PM", or "12:30 AM the next day" once it passes midnight. */
function clockAfter(minutes: number) {
  const day = Math.floor(minutes / 1440);
  const m = minutes % 1440;
  if (minutes === 1440) return "midnight";
  const hhmm = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return fmtClock(hhmm) + (day ? " the next day" : "");
}

type Panel = "who" | "often" | "count" | "time" | "start" | "points" | "missed";

const WEEKDAYS_ONLY = ["MO", "TU", "WE", "TH", "FR"] as const;
const isWeekdays = (p: PickerState) =>
  p.kind === "weeks" && p.interval === 1 && !p.afterCompletion && p.weekdays.length === 5 && WEEKDAYS_ONLY.every((d) => p.weekdays.includes(d));

/** "Daily" → "every day": the summary as it reads in the middle of a sentence. */
function oftenPhrase(summary: string) {
  const s = summary
    .replace(/^Daily\b/, "Every day")
    .replace(/^Weekly\b/, "Every week")
    .replace(/^Monthly\b/, "Every month");
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** "today", "tomorrow" or "Thu Nov 26". */
function dayPhrase(d: string) {
  if (d === today()) return "today";
  if (d === addDays(today(), 1)) return "tomorrow";
  return fmtDate(d, { weekday: "short", month: "short", day: "numeric" }).replace(",", "");
}

const TIMES = ["20:00", "21:00", "22:00"];

/** The editor (mockups 04, 52, 53 and desktop 14): the task as one sentence with tappable parts, then what else it asks. */
function Editor({ task, readOnly, defaultAssignee, start }: { task?: Task; readOnly: boolean; defaultAssignee: string; start?: string }) {
  const { rel, features, memberName, solo, me } = useRel();
  const navigate = useNavigate();
  const snack = useSnackbar();
  const wide = useMediaQuery("(min-width: 1024px)");
  const save = useSaveTask(rel.id);
  const rewards = useLibrary(rel.id, "rewards");
  const consequences = useLibrary(rel.id, "consequences");
  const [form, setForm] = useState(() => formFrom(task, defaultAssignee, start));
  const [panel, setPanel] = useState<Panel | null>(null);
  const [howOften, setHowOften] = useState(false);
  const [showSteps, setShowSteps] = useState(form.steps.length > 0);
  const [showPlace, setShowPlace] = useState(!!form.placeId);
  const [otherTime, setOtherTime] = useState(!form.allDay && !TIMES.includes(form.dueTime));
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const toggle = (p: Panel) => setPanel((o) => (o === p ? null : p));

  const sched = useMemo(() => {
    const p = form.picker;
    return preview(toSchedule(p), p.start > today() ? p.start : today(), 3);
  }, [form.picker]);
  const canSave = !readOnly && form.title.trim() && !sched.errors.length && form.assigneeId;
  // Back to wherever the editor was opened from: the task's page, or Today, Calendar or Tasks for a new one.
  const back = useBack(() => (task ? navigate({ to: "/tasks/$taskId", params: { taskId: task.id } }) : navigate({ to: "/" })));

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!canSave) return;
    save.mutate(
      // A quick deadline counts from when it's saved, not from when the chip was tapped.
      { id: task?.id, input: toInput(form.quick ? { ...form, ...quickDeadline(form.quick) } : form) },
      {
        onSuccess: (saved) => {
          snack(task ? "Task saved" : "Task created");
          if (task) back();
          else navigate({ to: "/tasks/$taskId", params: { taskId: saved.id }, replace: true });
        },
        onError: (err) => snack(errorMessage(err)),
      },
    );
  }

  const atMost = atMostOf(form);
  const mine = form.assigneeId === me.user.id;
  const who = memberName(form.assigneeId);
  const reward = rewards.data?.find((r) => r.id === form.rewardId)?.title;
  const consequence = consequences.data?.find((c) => c.id === form.consequenceId)?.title;
  const pts = Number.isFinite(form.points) ? Math.trunc(form.points) : 0;
  const penalty = Number.isFinite(form.missPenalty) ? Math.trunc(form.missPenalty) : 0;
  const { countMin, countMax } = countBoundsOf(form);
  const bounds =
    countMin != null && countMax != null
      ? countMin === countMax
        ? `${countMin} times`
        : `${countMin} to ${countMax} times`
      : countMin != null
        ? `at least ${countMin} times`
        : `no more than ${countMax} times`;
  const missedPhrase =
    [features.points && penalty ? `−${penalty} points` : null, features.consequences ? consequence : null].filter(Boolean).join(" and ") || "nothing happens";
  const timePhrase = form.allDay ? "the end of the day" : fmtClock(form.dueTime || "00:00");
  const giveLabel = task ? "Save" : mine || solo ? "Add it" : `Give to ${who}`;

  const slot = (p: Panel, text: ReactNode, label: string) =>
    readOnly ? (
      <span>{text}</span>
    ) : (
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

  const sentence = (
    <p className="font-serif text-[34px] leading-[1.25] tracking-[-0.01em] text-on-surface md:text-[44px] lg:text-[52px] lg:leading-[1.2]">
      {!solo && rel.members.length > 1 ? slot("who", mine ? "You" : who, "Who it's for") : mine ? "You" : who} will{" "}
      <span className="inline-grid max-w-full align-baseline">
        <span aria-hidden className="invisible col-start-1 row-start-1 overflow-hidden pr-1 whitespace-pre">
          {form.title || "do what"}
        </span>
        <input
          aria-label="Title"
          data-field
          size={1}
          value={form.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="do what"
          maxLength={200}
          required
          readOnly={readOnly}
          autoFocus={!task && !readOnly}
          className="col-start-1 row-start-1 w-full min-w-[4ch] border-b-[1.5px] border-primary bg-transparent p-0 text-inherit outline-none placeholder:text-on-surface-variant/50"
        />
      </span>
      {form.counted && <> {slot("count", bounds, "How many")}</>}
      {form.quick ? (
        <> {slot("time", `in ${quickLabel(form.quick)}`, "When it's due")}.</>
      ) : (
        <>
          {" "}
          {slot("often", sched.errors.length ? "how often?" : form.picker.kind === "once" ? "once" : oftenPhrase(sched.summary), "How often")} by{" "}
          {slot("time", timePhrase, "Due time")},{" "}
          {form.picker.kind === "once" ? (form.picker.start === today() || form.picker.start === addDays(today(), 1) ? "" : "on ") : "starting "}
          {slot("start", dayPhrase(form.picker.start), form.picker.kind === "once" ? "Day" : "First day")}.
        </>
      )}
      {features.points && <> It's worth {slot("points", `${pts} point${Math.abs(pts) === 1 ? "" : "s"}`, "Points")}.</>}
      {(features.points || features.consequences) && <> If it's missed, {slot("missed", missedPhrase, "If it's missed")}.</>}
    </p>
  );

  const row = (key: string, label: ReactNode, on: boolean, onClick: () => void, sub?: ReactNode) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      className="state-layer state-row flex w-full items-center gap-3 border-b border-outline-variant py-3.5 text-left last:border-b-0"
    >
      <span className="min-w-0 flex-1">
        <span className={cx("block text-body-large", on ? "text-on-surface" : "text-on-surface-variant")}>{label}</span>
        {sub && <span className="block text-body-small text-on-surface-variant">{sub}</span>}
      </span>
      {on && <Diamond state="owed" size={12} className="bg-primary" />}
    </button>
  );
  const done = (
    <div className="flex justify-end pt-2">
      <Button variant="text" onClick={() => setPanel(null)}>
        Done
      </Button>
    </div>
  );

  const panelBody: Record<Panel, () => ReactNode> = {
    who: () =>
      rel.members.map((m) =>
        row(
          m.userId,
          m.userId === me.user.id ? "You" : m.displayName,
          form.assigneeId === m.userId,
          () => (set({ assigneeId: m.userId }), setPanel(null)),
          ROLE_LABEL[m.role],
        ),
      ),
    often: () => {
      const p = form.picker;
      const pick = (patch: Partial<PickerState>) => (
        set({ picker: { ...p, afterCompletion: false, end: "never", interval: 1, ...patch }, counted: false }),
        setPanel(null)
      );
      const daily = p.kind === "days" && p.interval === 1 && !p.afterCompletion;
      const weekly = p.kind === "weeks" && p.interval === 1 && !p.afterCompletion && p.weekdays.length === 1;
      const preset = p.kind === "once" || daily || weekly || isWeekdays(p);
      return (
        <>
          {row("once", "Once", p.kind === "once", () => pick({ kind: "once" }))}
          {row("daily", "Every day", daily, () => pick({ kind: "days" }))}
          {row("weekdays", "Weekdays", isWeekdays(p), () => pick({ kind: "weeks", weekdays: [...WEEKDAYS_ONLY] }))}
          {row("weekly", `Every ${fmtDate(p.start, { weekday: "long" })}`, weekly, () => pick({ kind: "weeks", weekdays: defaultPicker(p.start).weekdays }))}
          {row(
            "other",
            preset ? "Something else…" : oftenPhrase(sched.summary || "Something else…").replace(/^./, (c) => c.toUpperCase()),
            !preset,
            () => (setPanel(null), setHowOften(true)),
          )}
          {!form.placeId &&
            row("count", form.counted ? "Stop counting" : "Count it instead…", false, () =>
              form.counted ? (set({ counted: false }), setPanel(null)) : (set({ counted: true, steps: [] }), setShowSteps(false), setPanel("count")),
            )}
        </>
      );
    },
    count: () => (
      <div className="flex flex-col gap-4 py-3">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["exactly", "Exactly"],
              ["atLeast", "At least"],
              ["atMost", "At most"],
              ["range", "Range"],
            ] as const
          ).map(([v, label]) => (
            <Chip key={v} plain selected={form.countKind === v} onClick={() => set({ countKind: v })}>
              {label}
            </Chip>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <TextField
            label={form.countKind === "range" ? "At least" : "Count"}
            type="number"
            min={1}
            max={1000}
            value={Number.isFinite(form.countN) ? form.countN : ""}
            onChange={(e) => set({ countN: num(e.target.value) })}
          />
          {form.countKind === "range" ? (
            <TextField
              label="At most"
              type="number"
              min={whole(form.countN)}
              max={1000}
              value={Number.isFinite(form.countTo) ? form.countTo : ""}
              onChange={(e) => set({ countTo: num(e.target.value) })}
            />
          ) : (
            features.points && (
              <Select label="Points" value={form.countPer} onChange={(e) => set({ countPer: e.target.value as Form["countPer"] })}>
                <option value="task">Per task</option>
                <option value="count">Per count</option>
              </Select>
            )
          )}
        </div>
        {form.countKind === "range" && features.points && (
          <Select label="Points" value={form.countPer} onChange={(e) => set({ countPer: e.target.value as Form["countPer"] })}>
            <option value="task">Per task</option>
            <option value="count">Per count</option>
          </Select>
        )}
        {atMost && (
          <p className="text-body-small text-on-surface-variant">"At most" is checked at the deadline, so it can't ask for a photo, a mood or an entry.</p>
        )}
        {done}
      </div>
    ),
    time: () => (
      <div className="flex flex-col gap-4 py-3">
        {!task && (
          <div className="flex flex-wrap gap-2">
            {QUICK.map((m) => (
              <Chip key={m} plain selected={form.quick === m} onClick={() => (set(quickDeadline(m)), setPanel(null))}>
                In {quickLabel(m)}
              </Chip>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {TIMES.map((t) => (
            <Chip
              key={t}
              plain
              selected={!form.quick && !form.allDay && !otherTime && form.dueTime === t}
              onClick={() => (set({ quick: null, allDay: false, dueTime: t }), setOtherTime(false), setPanel(null))}
            >
              {fmtClock(t)}
            </Chip>
          ))}
          <Chip plain selected={!form.quick && form.allDay} onClick={() => (set({ quick: null, allDay: true }), setOtherTime(false), setPanel(null))}>
            All day
          </Chip>
          <Chip plain selected={!form.quick && !form.allDay && otherTime} onClick={() => (set({ quick: null, allDay: false }), setOtherTime(true))}>
            Other…
          </Chip>
        </div>
        {!form.quick && !form.allDay && otherTime && (
          <TextField label="Due at" type="time" value={form.dueTime} onChange={(e) => set({ dueTime: e.target.value })} className="w-40" />
        )}
        {form.quick && !mine && <p className="text-body-small text-on-surface-variant">{who} gets a push right away and a countdown on Today.</p>}
        {done}
      </div>
    ),
    start: () => (
      <div className="flex flex-col gap-4 py-3">
        <div className="flex flex-wrap gap-2">
          {[today(), addDays(today(), 1)].map((d) => (
            <Chip key={d} plain selected={form.picker.start === d} onClick={() => (set({ picker: { ...form.picker, start: d } }), setPanel(null))}>
              {d === today() ? "Today" : "Tomorrow"}
            </Chip>
          ))}
        </div>
        <TextField
          label="Date"
          type="date"
          value={form.picker.start}
          onChange={(e) => e.target.value && set({ picker: { ...form.picker, start: e.target.value } })}
          className="w-48"
        />
        {done}
      </div>
    ),
    points: () => (
      <div className="flex flex-col gap-4 py-3">
        <div className="grid grid-cols-2 gap-4">
          <TextField
            label="Points if done"
            type="number"
            value={Number.isFinite(form.points) ? form.points : ""}
            onChange={(e) => set({ points: num(e.target.value) })}
          />
          <TextField
            label="Lost if missed"
            type="number"
            min={0}
            value={Number.isFinite(form.missPenalty) ? form.missPenalty : ""}
            onChange={(e) => set({ missPenalty: num(e.target.value) })}
          />
        </div>
        {done}
      </div>
    ),
    missed: () => (
      <>
        {features.points && (
          <div className="border-b border-outline-variant py-3">
            <TextField
              label="Points lost"
              type="number"
              min={0}
              value={Number.isFinite(form.missPenalty) ? form.missPenalty : ""}
              onChange={(e) => set({ missPenalty: num(e.target.value) })}
              className="w-40"
            />
          </div>
        )}
        {features.consequences && (
          <>
            {row("none", "No consequence", !form.consequenceId, () => set({ consequenceId: "" }))}
            {consequences.data?.map((c) => row(c.id, c.title, form.consequenceId === c.id, () => set({ consequenceId: c.id })))}
            {form.consequenceId && (
              <div className="grid grid-cols-2 gap-4 py-3">
                <Select label="Due" value={form.consequenceDueDays} onChange={(e) => set({ consequenceDueDays: Number(e.target.value) })}>
                  {[...new Set([0, 1, 2, 3, 7, form.consequenceDueDays])]
                    .sort((a, b) => a - b)
                    .map((d) => (
                      <option key={d} value={d}>
                        {dueDaysLabel(d)}
                      </option>
                    ))}
                </Select>
                <Select
                  label="By"
                  value={form.consequenceAllDay ? "" : form.consequenceDueTime}
                  onChange={(e) => set(e.target.value ? { consequenceAllDay: false, consequenceDueTime: e.target.value } : { consequenceAllDay: true })}
                >
                  <option value="">Any time that day</option>
                  {[...new Set(["12:00", "18:00", "21:00", form.consequenceDueTime])].sort().map((t) => (
                    <option key={t} value={t}>
                      {fmtClock(t)}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </>
        )}
        {done}
      </>
    ),
  };

  const also: { key: string; label: string; on: boolean; toggle(): void; show: boolean }[] = [
    { key: "approve", label: "I approve it", on: form.approvalRequired, toggle: () => set({ approvalRequired: !form.approvalRequired }), show: !solo },
    {
      key: "photo",
      label: "Ask for a photo",
      on: form.proofRequired,
      toggle: () => set({ proofRequired: !form.proofRequired }),
      show: !atMost && !form.placeId,
    },
    {
      key: "steps",
      label: "Steps",
      on: showSteps,
      toggle: () => (showSteps ? (setShowSteps(false), set({ steps: [] })) : setShowSteps(true)),
      show: !form.counted && !form.placeId,
    },
    { key: "mood", label: "Mood check-in", on: form.askMood, toggle: () => set({ askMood: !form.askMood }), show: !atMost && !form.placeId },
    {
      key: "journal",
      label: "Journal task",
      on: form.asksJournal,
      toggle: () => set({ asksJournal: !form.asksJournal }),
      show: (features.journal || form.asksJournal) && !atMost && !form.placeId,
    },
    {
      key: "early",
      label: "Can be done early",
      on: form.windowMinutes != null,
      toggle: () => set({ windowMinutes: form.windowMinutes != null ? null : 120 }),
      show: !form.allDay && !form.quick,
    },
    {
      key: "place",
      label: "Be somewhere",
      on: showPlace,
      toggle: () => (showPlace ? (setShowPlace(false), set({ placeId: "", stayMinutes: null })) : setShowPlace(true)),
      show: (features.location || !!form.placeId) && !form.counted && !form.steps.length,
    },
    {
      key: "words",
      label: "Remind in my words",
      on: form.reminder === "custom",
      toggle: () => set({ reminder: form.reminder === "custom" ? "default" : "custom" }),
      show: true,
    },
  ];

  const grace = graceMinutes(form);
  const dueMinutes = form.allDay || !form.dueTime ? 1440 : minutesOf(form.dueTime);

  const main = (
    <>
      {sentence}
      {panel && !readOnly && <div className="mt-4 rounded-lg border border-outline-variant bg-surface-container-lowest px-4">{panelBody[panel]()}</div>}

      {!readOnly && (
        <section className="mt-8">
          <h2 className="eyebrow mb-3">Also</h2>
          <div className="flex flex-wrap gap-2">
            {also
              .filter((a) => a.show)
              .map((a) => (
                <Chip key={a.key} selected={a.on} onClick={a.toggle}>
                  {a.label}
                </Chip>
              ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="eyebrow mb-1">{mine ? "Details" : `Details ${who} reads`}</h2>
        <MarkdownEditor
          value={form.bodyMd}
          onChange={(bodyMd) => set({ bodyMd })}
          editable={!readOnly}
          placeholder={`What to do, and why it matters`}
          label="Details"
          compact
        />
      </section>

      {showSteps && !form.counted && !form.placeId && <Steps steps={form.steps} onChange={(steps) => set({ steps })} readOnly={readOnly} />}

      {showPlace && !form.counted && <PlaceSection form={form} set={set} readOnly={readOnly} />}

      <section className="mt-8 flex flex-col gap-5">
        <h2 className="eyebrow -mb-2">Timing</h2>
        {!form.allDay && !form.quick && (
          <Select label="Can be done" value={form.windowMinutes ?? ""} onChange={(e) => set({ windowMinutes: e.target.value ? Number(e.target.value) : null })}>
            {[...new Set([...WINDOWS, form.windowMinutes])].map((m) => (
              <option key={m ?? "any"} value={m ?? ""}>
                {m === null ? "Any time that day" : `Up to ${windowLabel(m).replace(" before", "")} early`}
              </option>
            ))}
          </Select>
        )}
        <Select label="Time zone" value={form.timezone} onChange={(e) => set({ timezone: e.target.value })}>
          {[...new Set([form.timezone, ...Intl.supportedValuesOf("timeZone")])].map((z) => (
            <option key={z} value={z}>
              {tzName(z)}
              {z === browserTimeZone() ? " (this device)" : ""}
            </option>
          ))}
        </Select>
        {!form.quick && (
          <div className="flex flex-col gap-5">
            <Select
              label="Missed after"
              value={form.grace}
              onChange={(e) => {
                const g = e.target.value as Grace;
                set({ grace: g, graceMinutes: g === "custom" ? grace || 30 : form.graceMinutes });
              }}
            >
              <option value="none">Right at {form.allDay ? "midnight" : "the due time"}</option>
              <option value="15">15 min late</option>
              <option value="60">1 hour late</option>
              {!form.allDay && <option value="midnight">Midnight</option>}
              <option value="custom">Other</option>
            </Select>
            {form.grace === "custom" ? (
              <TextField
                label="Minutes late"
                type="number"
                min={0}
                value={Number.isFinite(form.graceMinutes) ? form.graceMinutes : ""}
                onChange={(e) => set({ graceMinutes: num(e.target.value) })}
              />
            ) : null}
            {grace > 0 && <p className="-mt-3 text-body-small text-on-surface-variant">Missed at {clockAfter(dueMinutes + grace)}</p>}
          </div>
        )}
      </section>

      <Reminders form={form} set={set} readOnly={readOnly} />

      {features.points && (
        <section className="mt-8">
          <h2 className="eyebrow mb-1">Reward when done</h2>
          <Select aria-label="Reward when done" value={form.rewardId} onChange={(e) => set({ rewardId: e.target.value })}>
            <option value="">None</option>
            {rewards.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </Select>
        </section>
      )}
    </>
  );

  const actions = !readOnly && (
    <Button type="submit" busy={save.isPending} disabled={!canSave} className={wide ? "h-12 px-7" : "h-12 w-full"}>
      {giveLabel}
    </Button>
  );

  if (wide)
    return (
      <form onSubmit={submit} className="grid min-h-dvh grid-cols-[minmax(0,1fr)_360px]">
        <div className="max-w-[880px] px-12 pt-10 pb-16">
          <div className="eyebrow mb-4">{readOnly ? "Task" : task ? "Edit task" : "New task"}</div>
          <fieldset disabled={readOnly} className="contents">
            {main}
          </fieldset>
          <div className="mt-10 flex gap-3">
            {actions}
            <Button variant="outlined" className="h-12 px-7" onClick={back}>
              {readOnly ? "Back" : "Cancel"}
            </Button>
          </div>
        </div>
        <aside className="border-l border-outline-variant bg-surface-container-lowest px-8 pt-10">
          <Preview form={form} who={mine ? "you" : who} sched={sched} reward={reward} />
        </aside>
        <HowOften open={howOften} onClose={() => setHowOften(false)} picker={form.picker} onChange={(picker) => set({ picker, quick: null })} />
      </form>
    );

  return (
    <form onSubmit={submit}>
      <header className="sticky top-0 z-10 grid grid-cols-[1fr_auto_1fr] items-center bg-surface px-4 py-2">
        <button type="button" onClick={back} className="state-layer -ml-2 h-10 justify-self-start rounded-md px-2 text-body-large text-on-surface-variant">
          {readOnly ? "Back" : "Cancel"}
        </button>
        <h1 className="text-title-medium text-on-surface">{readOnly ? "Task" : task ? "Edit task" : "New task"}</h1>
        <div className="justify-self-end">
          {!task && !readOnly && <IconButton icon="stacks" label="Start from a kit" onClick={() => navigate({ to: "/kits" })} />}
        </div>
      </header>
      <fieldset disabled={readOnly} className="px-4 pt-6 pb-32 md:px-6">
        {main}
      </fieldset>
      {actions && <div className="fixed inset-x-0 bottom-0 z-10 bg-surface px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-6">{actions}</div>}
      <HowOften open={howOften} onClose={() => setHowOften(false)} picker={form.picker} onChange={(picker) => set({ picker, quick: null })} />
    </form>
  );
}

function HowOften({ open, onClose, picker, onChange }: { open: boolean; onClose(): void; picker: PickerState; onChange(p: PickerState): void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={<span className="font-serif text-[34px]">How often</span>}
      actions={
        <Button className="h-12 w-full" onClick={onClose}>
          Done
        </Button>
      }
    >
      <RecurrencePicker value={picker} onChange={onChange} />
    </Dialog>
  );
}

/** Desktop: the task as it will show on their Today, and its next three dates. */
function Preview({ form, who, sched, reward }: { form: Form; who: string; sched: ReturnType<typeof preview>; reward?: string }) {
  const { features, memberName, rel, me } = useRel();
  const dom = rel.members.find((m) => m.role !== "submissive" && m.userId !== form.assigneeId)?.userId ?? me.user.id;
  const time = form.allDay ? "All day" : form.quick ? `In ${quickLabel(form.quick)}` : fmtClock(form.dueTime);
  const first = sched.dates[0];
  const sub = [
    form.quick ? "Once" : form.picker.kind === "once" ? "Once" : sched.summary,
    form.approvalRequired ? `${memberName(dom)} approve${memberName(dom) === "You" ? "" : "s"} it` : null,
    features.points && form.points ? `${form.points > 0 ? "+" : "−"}${Math.abs(Math.trunc(form.points))}` : null,
    reward ? `Reward: ${reward}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <>
      <h2 className="eyebrow mb-4">How {who} will see it</h2>
      <div className="rounded-lg border border-outline-variant bg-surface p-6">
        <div className="eyebrow">
          {first && !form.quick ? dayPhrase(first) : "Today"} · {time}
        </div>
        <div className="mt-2 font-serif text-[30px] leading-tight text-on-surface">{form.title.trim() || "Untitled"}</div>
        <div className="mt-1 text-body-medium text-on-surface-variant">{sub}</div>
        <div aria-hidden className="mt-5 grid grid-cols-2 gap-2">
          <span className="flex h-10 items-center justify-center rounded-sm bg-on-surface text-label-large text-surface">Done</span>
          <span className="flex h-10 items-center justify-center rounded-sm border border-on-surface text-label-large text-on-surface">More time</span>
        </div>
      </div>
      {!form.quick && form.picker.kind !== "once" && sched.dates.length > 0 && (
        <>
          <h2 className="eyebrow mt-8 mb-1">Next three</h2>
          {sched.dates.map((d) => (
            <div key={d} className="flex items-center border-b border-outline-variant py-3.5">
              <span className="flex-1 text-body-large text-on-surface">{fmtDate(d, { weekday: "short", month: "short", day: "numeric" })}</span>
              <span className="text-body-medium text-on-surface-variant">{form.allDay ? "All day" : fmtClock(form.dueTime)}</span>
            </div>
          ))}
        </>
      )}
      {sched.errors.length > 0 && <p className="mt-6 text-body-medium text-error">{sched.errors[0]}</p>}
    </>
  );
}

const REMINDERS: { value: Reminder; label: string }[] = [
  { value: "default", label: "Fealty's" },
  { value: "custom", label: "In my words" },
  { value: "none", label: "None" },
];

/** The push half an hour before it's due: the app's, the Dominant's own words, or none for a Dom who'd rather nudge. */
function Reminders({ form, set, readOnly }: { form: Form; set(p: Partial<Form>): void; readOnly: boolean }) {
  const { rel, memberName } = useRel();
  const who = memberName(form.assigneeId);
  const details = rel.members.find((m) => m.userId === form.assigneeId)?.notifyDetails ?? false;
  return (
    <section className="mt-8">
      <h2 className="eyebrow mb-3">Reminders</h2>
      <div className="flex flex-wrap gap-2">
        {REMINDERS.map((r) => (
          <Chip key={r.value} plain selected={form.reminder === r.value} onClick={readOnly ? undefined : () => set({ reminder: r.value })}>
            {r.label}
          </Chip>
        ))}
      </div>
      {form.reminder === "custom" && (
        <>
          <div className="mt-3 flex items-baseline border-b border-outline-variant focus-within:border-on-surface">
            <span className="text-body-large text-on-surface">“</span>
            <input
              aria-label="What they'll read"
              placeholder="Lines, pet. Neatly."
              value={form.reminderText}
              onChange={(e) => set({ reminderText: e.target.value })}
              maxLength={140}
              className="h-11 min-w-0 flex-1 bg-transparent text-body-large text-on-surface outline-none placeholder:text-on-surface-variant/60"
            />
            <span className="text-body-large text-on-surface">”</span>
          </div>
          {!details && who !== "You" && (
            <p className="mt-1 text-body-small text-on-surface-variant">{who} keeps notifications discreet, so they'll see "A task is due soon".</p>
          )}
        </>
      )}
    </section>
  );
}

const STAYS = [null, 30, 45, 60, 90, 120];
const stayLabel = (m: number) => (m >= 60 && m % 60 === 0 ? `${m / 60} hour${m === 60 ? "" : "s"}` : `${m} minutes`);

/** A location task: done by getting to a place by the due time, and staying a while if it says so. */
function PlaceSection({ form, set, readOnly }: { form: Form; set(p: Partial<Form>): void; readOnly: boolean }) {
  const { rel, memberName } = useRel();
  const places = usePlaces(rel.id);
  const [adding, setAdding] = useState(false);
  const assignee = rel.members.find((m) => m.userId === form.assigneeId);
  const name = memberName(form.assigneeId);
  // A place can only be set once the assignee's phone can notice arrivals; one already set stays editable.
  const ready = assignee?.locationStatus === "ready" || !!form.placeId;
  return (
    <section className="mt-8 flex flex-col gap-5">
      <h2 className="eyebrow -mb-2">Be somewhere</h2>
      {!ready ? (
        <>
          <p className="text-body-medium text-on-surface-variant">{name === "You" ? "You haven't" : `${name} hasn't`} allowed location on Android yet.</p>
          {!readOnly && assignee && (
            <div>
              <AskLocationButton name={name} />
            </div>
          )}
        </>
      ) : (
        <>
          <Select
            label="Place"
            value={form.placeId}
            onChange={(e) => (e.target.value === "+" ? setAdding(true) : set({ placeId: e.target.value, ...(e.target.value ? {} : { stayMinutes: null }) }))}
          >
            <option value="">Choose a place</option>
            {(places.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            {!readOnly && <option value="+">Add a place…</option>}
          </Select>
          {form.placeId && (
            <Select label="Stay at least" value={form.stayMinutes ?? ""} onChange={(e) => set({ stayMinutes: e.target.value ? Number(e.target.value) : null })}>
              {[...new Set([...STAYS, form.stayMinutes])].map((m) => (
                <option key={m ?? "no"} value={m ?? ""}>
                  {m == null ? "Done on arrival" : stayLabel(m)}
                </option>
              ))}
            </Select>
          )}
        </>
      )}
      <PlaceDialog place={null} open={adding} onClose={() => setAdding(false)} onSaved={(p) => set({ placeId: p.id })} />
    </section>
  );
}

/** A ritual's steps: done in order, one at a time, from a run view. A task with none is an ordinary task. */
function Steps({ steps, onChange, readOnly }: { steps: TaskStep[]; onChange(steps: TaskStep[]): void; readOnly: boolean }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const title = draft.trim();
    if (!title || steps.length >= 30) return;
    onChange([...steps, { id: crypto.randomUUID().slice(0, 8), title }]);
    setDraft("");
  };
  return (
    <section className="mt-8">
      <h2 className="eyebrow mb-1">Steps</h2>
      {steps.length > 0 && (
        <ol>
          <SortableList items={steps} enabled={!readOnly} onReorder={onChange}>
            {(s, i, handle) => (
              <li className="flex items-center gap-2 border-b border-outline-variant">
                {handle}
                <span className="text-body-large text-on-surface tabular-nums">{i + 1}.</span>
                <input
                  aria-label={`Step ${i + 1}`}
                  value={s.title}
                  maxLength={200}
                  onChange={(e) => onChange(steps.map((x) => (x.id === s.id ? { ...x, title: e.target.value } : x)))}
                  className="h-13 min-w-0 flex-1 bg-transparent text-body-large text-on-surface outline-none"
                />
                {!readOnly && <IconButton icon="close" label={`Remove step ${i + 1}`} onClick={() => onChange(steps.filter((x) => x.id !== s.id))} />}
              </li>
            )}
          </SortableList>
        </ol>
      )}
      {!readOnly && steps.length < 30 && (
        <div className="flex items-center gap-2 border-b border-outline-variant focus-within:border-on-surface">
          <span className="text-body-large text-primary">+</span>
          <input
            aria-label="Add a step"
            placeholder="Add a step"
            value={draft}
            maxLength={200}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={add}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            className="h-12 min-w-0 flex-1 bg-transparent text-body-large text-on-surface outline-none placeholder:text-primary"
          />
        </div>
      )}
    </section>
  );
}
