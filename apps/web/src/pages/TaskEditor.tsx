import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useLibrary, useSaveTask, useTasks } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Task, TaskInput } from "../api/types";
import { RecurrencePicker } from "../components/RecurrencePicker";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { Button, Chip, ErrorBox, Icon, IconButton, Loading, Select, Switch, TextField, cx, useSnackbar } from "../components/ui";
import { type PickerState, defaultPicker, fromSchedule, preview, toSchedule } from "../recurrence/picker";
import { browserTimeZone, fmtClock, fmtDate, today } from "../lib/dates";
import { useRel } from "../lib/relationship";
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
  allDay: boolean;
  dueTime: string;
  timezone: string;
  grace: Grace;
  graceMinutes: number;
}

/** Grace chips. "midnight" follows the due time, so moving the time keeps it meaning "until midnight". */
type Grace = "none" | "15" | "60" | "midnight" | "custom";

const minutesOf = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const toMidnight = (dueTime: string) => 24 * 60 - minutesOf(dueTime);

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
    allDay: task ? task.dueTime === null : false,
    dueTime: task?.dueTime ?? "21:00",
    timezone: task?.timezone ?? browserTimeZone(),
    grace: graceOf(task),
    graceMinutes: task?.graceMinutes ?? 0,
  };
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
    proofRequired: f.proofRequired,
    approvalRequired: f.approvalRequired,
    schedule: toSchedule(f.picker),
    dueTime: f.allDay ? null : f.dueTime || null,
    timezone: f.timezone,
    graceMinutes: graceMinutes(f),
  };
}

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

/** "Thu Oct 22", without the comma, so a list of them reads cleanly. */
const shortDay = (d: string) => fmtDate(d).replace(",", "");

/** "9:15 PM", or "12:30 AM the next day" once it passes midnight. */
function clockAfter(minutes: number) {
  const day = Math.floor(minutes / 1440);
  const m = minutes % 1440;
  if (minutes === 1440) return "midnight";
  const hhmm = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return fmtClock(hhmm) + (day ? " the next day" : "");
}

function Editor({ task, readOnly, defaultAssignee, start }: { task?: Task; readOnly: boolean; defaultAssignee: string; start?: string }) {
  const { rel, features, memberName } = useRel();
  const navigate = useNavigate();
  const snack = useSnackbar();
  const save = useSaveTask(rel.id);
  const rewards = useLibrary(rel.id, "rewards");
  const consequences = useLibrary(rel.id, "consequences");
  const [form, setForm] = useState(() => formFrom(task, defaultAssignee, start));
  const [changingZone, setChangingZone] = useState(false);
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  const sched = useMemo(() => {
    const p = form.picker;
    return preview(toSchedule(p), p.start > today() ? p.start : today(), 3);
  }, [form.picker]);
  const canSave = !readOnly && form.title.trim() && !sched.errors.length && form.assigneeId;
  // Back to wherever the editor was opened from: the task's page, or Today, Calendar or Tasks for a new one.
  const back = useBack(() => (task ? navigate({ to: "/tasks/$taskId", params: { taskId: task.id } }) : navigate({ to: "/" })));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    save.mutate(
      { id: task?.id, input: toInput(form) },
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

  // Each section collapses to a sentence, so the whole task reads at a glance.
  const when = form.allDay ? ", all day" : form.dueTime ? ` at ${fmtClock(form.dueTime)}` : "";
  const scheduleTitle = form.picker.kind === "once" ? `Once, ${fmtDate(form.picker.start)}${when}` : `${sched.summary || "Schedule"}${when}`;
  const scheduleSub = sched.errors.length
    ? (sched.errors[0] ?? "")
    : [form.picker.kind !== "once" && sched.dates.length ? `Next ${sched.dates.map(shortDay).join(", ")}` : null, `${tzName(form.timezone)} time`].filter(Boolean).join(" · ");

  const reward = rewards.data?.find((r) => r.id === form.rewardId)?.title;
  const consequence = consequences.data?.find((c) => c.id === form.consequenceId)?.title;
  const pts = Number.isFinite(form.points) ? Math.trunc(form.points) : 0;
  const penalty = Number.isFinite(form.missPenalty) ? Math.trunc(form.missPenalty) : 0;
  const stakesTitle = features.points
    ? [pts ? `${pts > 0 ? "+" : "−"}${Math.abs(pts)} if done` : "No points", penalty ? `−${penalty} if missed` : null].filter(Boolean).join(" · ")
    : consequence
      ? `Missed: ${consequence}`
      : "No consequence";
  const stakesSub = [
    features.consequences && features.points ? `Missed: ${consequence ?? "nothing"}` : null,
    features.consequences && consequence ? `due ${dueDaysLabel(form.consequenceDueDays).toLowerCase()}` : null,
    features.points ? `Reward: ${reward ?? "none"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const grace = graceMinutes(form);
  const dueMinutes = form.allDay || !form.dueTime ? 1440 : minutesOf(form.dueTime);
  const graceTitle = form.grace === "none" ? "No grace period" : form.grace === "midnight" ? "Grace until midnight" : `${grace} min grace`;
  const graceSub = `Counts as missed ${grace ? "at" : "right at"} ${form.allDay && !grace ? "midnight" : clockAfter(dueMinutes + grace)}`;
  const graceChips: { value: Grace; label: string }[] = [
    { value: "none", label: "None" },
    { value: "15", label: "15 min" },
    { value: "60", label: "1 hour" },
    ...(form.allDay ? [] : [{ value: "midnight" as const, label: "Until midnight" }]),
    { value: "custom", label: "Custom" },
  ];

  return (
    <form onSubmit={submit}>
      <header className="sticky top-0 z-10 flex items-center gap-2 bg-surface px-2 py-2 md:px-4">
        <IconButton icon="close" label="Close" onClick={back} />
        <h1 className="flex-1 truncate text-title-large text-on-surface">{readOnly ? form.title : task ? "Edit task" : "New task"}</h1>
        {!readOnly && (
          <Button type="submit" busy={save.isPending} disabled={!canSave}>
            Save
          </Button>
        )}
      </header>

      <fieldset disabled={readOnly} className="flex flex-col gap-4 px-4 pt-4 pb-10 md:px-6">
        <TextField label="Title" value={form.title} onChange={(e) => set({ title: e.target.value })} maxLength={200} required autoFocus={!task} />
        <div>
          <div className="mb-1 px-1 text-label-large text-on-surface-variant">Details</div>
          <MarkdownEditor value={form.bodyMd} onChange={(bodyMd) => set({ bodyMd })} editable={!readOnly} placeholder="What to do, and how" label="Details" compact />
        </div>

        <div className="mt-2 flex flex-col gap-2">
          <Fold
            icon="person"
            title={`For ${memberName(form.assigneeId)}`}
            sub={[form.approvalRequired ? "Needs your approval" : "No approval needed", form.proofRequired ? "proof required" : "no proof"].join(" · ")}
            open={readOnly}
          >
            <Select label="Assigned to" value={form.assigneeId} onChange={(e) => set({ assigneeId: e.target.value })}>
              {rel.members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.displayName} ({m.role})
                </option>
              ))}
            </Select>
            <div>
              <Switch
                checked={form.approvalRequired}
                onChange={(approvalRequired) => set({ approvalRequired })}
                label="Needs approval"
                help={features.points ? "Points post only after you approve the completion." : "It counts as done only after you approve it."}
              />
              <Switch
                checked={form.proofRequired}
                onChange={(proofRequired) => set({ proofRequired })}
                label="Proof required"
                help="A note or photo must accompany the completion."
              />
            </div>
          </Fold>

          <Fold icon="event_repeat" title={scheduleTitle} sub={scheduleSub} error={!!sched.errors.length} open={readOnly || !task}>
            <RecurrencePicker value={form.picker} onChange={(picker) => set({ picker })} />
            <div className="flex flex-wrap items-center gap-4">
              <div className="w-full sm:w-auto">
                <Switch checked={form.allDay} onChange={(allDay) => set({ allDay })} label="All day" help="Due by the end of the day" />
              </div>
              {!form.allDay && <TextField label="Due at" type="time" value={form.dueTime} onChange={(e) => set({ dueTime: e.target.value })} className="w-36" />}
            </div>
            {changingZone ? (
              <Select label="Time zone" value={form.timezone} onChange={(e) => set({ timezone: e.target.value })}>
                {[...new Set([form.timezone, ...Intl.supportedValuesOf("timeZone")])].map((z) => (
                  <option key={z} value={z}>
                    {z.replace(/_/g, " ")}
                  </option>
                ))}
              </Select>
            ) : (
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="text-body-large text-on-surface">Time zone</div>
                  <div className="text-body-medium text-on-surface-variant">
                    {tzName(form.timezone)}
                    {form.timezone === browserTimeZone() ? " (this device)" : ""}
                  </div>
                </div>
                {!readOnly && (
                  <Button variant="text" onClick={() => setChangingZone(true)}>
                    Change
                  </Button>
                )}
              </div>
            )}
          </Fold>

          {(features.points || features.consequences) && (
            <Fold icon="balance" title={stakesTitle} sub={stakesSub} open={readOnly}>
              {features.points && (
                <div className="flex gap-4">
                  <TextField
                    label="Points if done"
                    type="number"
                    value={Number.isFinite(form.points) ? form.points : ""}
                    onChange={(e) => set({ points: num(e.target.value) })}
                    className="flex-1"
                  />
                  <TextField
                    label="Lost if missed"
                    type="number"
                    min={0}
                    value={Number.isFinite(form.missPenalty) ? form.missPenalty : ""}
                    onChange={(e) => set({ missPenalty: num(e.target.value) })}
                    className="flex-1"
                  />
                </div>
              )}
              {features.points && (
                <Select label="Reward on completion" value={form.rewardId} onChange={(e) => set({ rewardId: e.target.value })}>
                  <option value="">None</option>
                  {rewards.data?.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                    </option>
                  ))}
                </Select>
              )}
              {features.consequences && (
                <Select
                  label="Consequence if missed"
                  help={form.consequenceId ? "Handed out automatically when it's missed" : undefined}
                  value={form.consequenceId}
                  onChange={(e) => set({ consequenceId: e.target.value })}
                >
                  <option value="">None</option>
                  {consequences.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </Select>
              )}
              {features.consequences && form.consequenceId && (
                <div className="flex flex-wrap items-center gap-4">
                  <Select label="Consequence due" value={form.consequenceDueDays} onChange={(e) => set({ consequenceDueDays: Number(e.target.value) })} className="w-48">
                    {[...new Set([0, 1, 2, 3, 7, form.consequenceDueDays])]
                      .sort((a, b) => a - b)
                      .map((d) => (
                        <option key={d} value={d}>
                          {dueDaysLabel(d)}
                        </option>
                      ))}
                  </Select>
                  <Switch checked={form.consequenceAllDay} onChange={(consequenceAllDay) => set({ consequenceAllDay })} label="Any time that day" />
                  {!form.consequenceAllDay && (
                    <TextField label="By" type="time" value={form.consequenceDueTime} onChange={(e) => set({ consequenceDueTime: e.target.value })} className="w-36" />
                  )}
                </div>
              )}
            </Fold>
          )}

          <Fold icon="timer" title={graceTitle} sub={graceSub} open={readOnly}>
            <div className="flex flex-wrap gap-2">
              {graceChips.map((c) => (
                <Chip key={c.value} selected={form.grace === c.value} onClick={() => set({ grace: c.value, graceMinutes: c.value === "custom" ? grace || 30 : form.graceMinutes })}>
                  {c.label}
                </Chip>
              ))}
            </div>
            {form.grace === "custom" && (
              <TextField
                label="Minutes"
                type="number"
                min={0}
                value={Number.isFinite(form.graceMinutes) ? form.graceMinutes : ""}
                onChange={(e) => set({ graceMinutes: num(e.target.value) })}
                className="w-36"
              />
            )}
          </Fold>
        </div>
      </fieldset>
    </form>
  );
}

/** A section that collapses to a one-line summary of what's in it. */
function Fold({ icon, title, sub, error, open: initiallyOpen, children }: { icon: string; title: string; sub: string; error?: boolean; open?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(!!initiallyOpen);
  return (
    <section className="rounded-lg bg-surface-container-low" style={{ ["--field-bg" as string]: "var(--md-surface-container-low)" }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="state-layer flex w-full items-center gap-4 rounded-lg px-4 py-3 text-left">
        <Icon name={icon} className="text-on-surface-variant" />
        <span className="min-w-0 flex-1">
          <span className="block text-body-large text-on-surface">{title}</span>
          <span className={cx("block text-body-medium", error ? "text-error" : "text-on-surface-variant")}>{sub}</span>
        </span>
        <Icon name={open ? "expand_less" : "expand_more"} className="text-on-surface-variant" />
      </button>
      {open && <div className="flex flex-col gap-4 px-4 pt-2 pb-4">{children}</div>}
    </section>
  );
}
