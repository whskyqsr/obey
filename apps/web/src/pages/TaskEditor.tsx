import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useDeleteTask, useLibrary, useSaveTask, useTasks } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Task, TaskInput } from "../api/types";
import { RecurrencePicker } from "../components/RecurrencePicker";
import { TaskHistory } from "../components/TaskHistory";
import { Button, Dialog, ErrorBox, IconButton, Loading, Select, Switch, TextArea, TextField, useSnackbar } from "../components/ui";
import { type PickerState, defaultPicker, fromSchedule, toSchedule } from "../recurrence/picker";
import { validateSchedule } from "@obey/recurrence";
import { browserTimeZone, today } from "../lib/dates";
import { useRel } from "../lib/relationship";

interface Form {
  title: string;
  bodyMd: string;
  assigneeId: string;
  points: number;
  missPenalty: number;
  rewardId: string;
  consequenceId: string;
  proofRequired: boolean;
  approvalRequired: boolean;
  picker: PickerState;
  allDay: boolean;
  dueTime: string;
  timezone: string;
  graceMinutes: number;
}

function formFrom(task: Task | undefined, defaultAssignee: string): Form {
  return {
    title: task?.title ?? "",
    bodyMd: task?.bodyMd ?? "",
    assigneeId: task?.assigneeId ?? defaultAssignee,
    points: task?.points ?? 5,
    missPenalty: task?.missPenalty ?? 0,
    rewardId: task?.rewardId ?? "",
    consequenceId: task?.consequenceId ?? "",
    proofRequired: task?.proofRequired ?? false,
    approvalRequired: task?.approvalRequired ?? false,
    picker: task ? fromSchedule(task.schedule) : { ...defaultPicker(today()), kind: "days" },
    allDay: task ? task.dueTime === null : false,
    dueTime: task?.dueTime ?? "21:00",
    timezone: task?.timezone ?? browserTimeZone(),
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
    proofRequired: f.proofRequired,
    approvalRequired: f.approvalRequired,
    schedule: toSchedule(f.picker),
    dueTime: f.allDay ? null : f.dueTime || null,
    timezone: f.timezone,
    graceMinutes: Number.isFinite(f.graceMinutes) ? Math.max(0, Math.trunc(f.graceMinutes)) : 0,
  };
}

const num = (v: string) => (v === "" ? NaN : Number(v));

export function TaskEditorPage({ taskId }: { taskId: string }) {
  const { rel, isDom, me } = useRel();
  const tasks = useTasks(rel.id);
  const isNew = taskId === "new";
  const task = tasks.data?.find((t) => t.id === taskId);
  if (!isNew && tasks.isLoading) return <Loading />;
  if (!isNew && tasks.error) return <ErrorBox error={tasks.error} onRetry={() => tasks.refetch()} />;
  if (!isNew && !task) return <ErrorBox error="That task doesn't exist any more." />;
  const defaultAssignee = rel.members.find((m) => m.role === "submissive" && m.userId !== me.user.id)?.userId ?? me.user.id;
  return <Editor key={taskId} task={task} readOnly={!isDom} defaultAssignee={defaultAssignee} />;
}

function Editor({ task, readOnly, defaultAssignee }: { task?: Task; readOnly: boolean; defaultAssignee: string }) {
  const { rel, features } = useRel();
  const navigate = useNavigate();
  const snack = useSnackbar();
  const save = useSaveTask(rel.id);
  const del = useDeleteTask(rel.id);
  const rewards = useLibrary(rel.id, "rewards");
  const consequences = useLibrary(rel.id, "consequences");
  const [form, setForm] = useState(() => formFrom(task, defaultAssignee));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  const scheduleErrors = useMemo(() => validateSchedule(toSchedule(form.picker)), [form.picker]);
  const canSave = !readOnly && form.title.trim() && !scheduleErrors.length && form.assigneeId;
  const back = () => navigate({ to: "/tasks" });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    save.mutate(
      { id: task?.id, input: toInput(form) },
      {
        onSuccess: () => {
          snack(task ? "Task saved" : "Task created");
          back();
        },
        onError: (err) => snack(errorMessage(err)),
      },
    );
  }

  return (
    <form onSubmit={submit}>
      <header className="sticky top-0 z-10 flex items-center gap-2 bg-surface px-2 py-2 md:px-4">
        <IconButton icon="arrow_back" label="Back" onClick={back} />
        <h1 className="flex-1 truncate text-title-large text-on-surface">{readOnly ? form.title : task ? "Edit task" : "New task"}</h1>
        {!readOnly && task && <IconButton icon="delete" label="Delete" onClick={() => setConfirmDelete(true)} />}
        {!readOnly && (
          <Button type="submit" busy={save.isPending} disabled={!canSave}>
            Save
          </Button>
        )}
      </header>

      <fieldset disabled={readOnly} className="flex flex-col gap-6 px-4 pt-4 pb-10 md:px-6">
        <TextField label="Title" value={form.title} onChange={(e) => set({ title: e.target.value })} maxLength={200} required />
        <TextArea label="Details (Markdown)" value={form.bodyMd} onChange={(e) => set({ bodyMd: e.target.value })} rows={3} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Assigned to" value={form.assigneeId} onChange={(e) => set({ assigneeId: e.target.value })}>
            {rel.members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.displayName} ({m.role})
              </option>
            ))}
          </Select>
          {features.points && (
            <div className="flex gap-4">
              <TextField label="Points" type="number" value={Number.isFinite(form.points) ? form.points : ""} onChange={(e) => set({ points: num(e.target.value) })} className="flex-1" />
              <TextField label="Miss penalty" type="number" min={0} value={Number.isFinite(form.missPenalty) ? form.missPenalty : ""} onChange={(e) => set({ missPenalty: num(e.target.value) })} className="flex-1" />
            </div>
          )}
        </div>

        <section className="rounded-lg bg-surface-container-low p-4" style={{ ["--field-bg" as string]: "var(--md-surface-container-low)" }}>
          <h2 className="mb-4 text-title-medium text-on-surface">Schedule</h2>
          <RecurrencePicker value={form.picker} onChange={(picker) => set({ picker })} />
          <div className="mt-6 flex flex-wrap items-start gap-4">
            <div className="w-full sm:w-auto">
              <Switch checked={form.allDay} onChange={(allDay) => set({ allDay })} label="All day" />
            </div>
            {!form.allDay && <TextField label="Due at" type="time" value={form.dueTime} onChange={(e) => set({ dueTime: e.target.value })} className="w-36" />}
            <TextField label="Grace (minutes)" type="number" min={0} value={Number.isFinite(form.graceMinutes) ? form.graceMinutes : ""} onChange={(e) => set({ graceMinutes: num(e.target.value) })} className="w-40" />
            <TextField label="Time zone" value={form.timezone} onChange={(e) => set({ timezone: e.target.value })} className="min-w-48 flex-1" />
          </div>
        </section>

        {(features.points || features.consequences) && (
          <div className="grid gap-4 sm:grid-cols-2">
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
              <Select label="Consequence if missed" value={form.consequenceId} onChange={(e) => set({ consequenceId: e.target.value })}>
                <option value="">None</option>
                {consequences.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </Select>
            )}
          </div>
        )}

        <div>
          <Switch
            checked={form.approvalRequired}
            onChange={(approvalRequired) => set({ approvalRequired })}
            label="Needs approval"
            help={features.points ? "Points post only after you approve the completion." : "It counts as done only after you approve it."}
          />
          <Switch checked={form.proofRequired} onChange={(proofRequired) => set({ proofRequired })} label="Proof required" help="A note or photo must accompany the completion." />
        </div>
      </fieldset>

      {task && <TaskHistory taskId={task.id} />}

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        icon="delete"
        title="Delete this task?"
        sheetOnMobile={false}
        actions={
          <>
            <Button variant="text" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              busy={del.isPending}
              onClick={() =>
                task &&
                del.mutate(task.id, {
                  onSuccess: () => {
                    snack("Task deleted");
                    back();
                  },
                  onError: (e) => snack(errorMessage(e)),
                })
              }
            >
              Delete
            </Button>
          </>
        }
      >
        Upcoming occurrences are removed. Completed ones stay in the history.
      </Dialog>
    </form>
  );
}
