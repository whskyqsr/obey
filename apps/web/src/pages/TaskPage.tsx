import { useNavigate } from "@tanstack/react-router";
import type { Task } from "../api/types";
import { useDeleteTask, useTaskStats, useTasks } from "../api/hooks";
import { errorMessage } from "../api/client";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { OccurrenceCard } from "../components/OccurrenceCard";
import { useCurrentOccurrences } from "../lib/currentOccurrences";
import { TaskHistory } from "../components/TaskHistory";
import { Badge, ErrorBox, IconButton, Loading, OverflowMenu, useSnackbar } from "../components/ui";
import { fmtClock, fmtRelative } from "../lib/dates";
import { useRel } from "../lib/relationship";
import { useBack } from "../lib/useBack";
import { useConfirm } from "../lib/useConfirm";

function useTask(taskId: string) {
  const { rel } = useRel();
  const tasks = useTasks(rel.id);
  const task = tasks.data?.find((t) => t.id === taskId);
  const gate = tasks.isLoading ? <Loading /> : tasks.error ? <ErrorBox error={tasks.error} onRetry={() => tasks.refetch()} /> : !task ? <ErrorBox error="That task doesn't exist any more." /> : null;
  return { task, gate };
}

/** One task: what it is, how it's going, and what's due now. History and editing live under the ⋮ menu. */
export function TaskPage({ taskId }: { taskId: string }) {
  const { task, gate } = useTask(taskId);
  return gate ?? <TaskView task={task!} />;
}

function TaskView({ task }: { task: Task }) {
  const { rel, isDom, memberName, features } = useRel();
  const navigate = useNavigate();
  const snack = useSnackbar();
  const del = useDeleteTask(rel.id);
  const [confirm, confirmEl] = useConfirm();
  const { byTask, query } = useCurrentOccurrences();
  const stats = useTaskStats(rel.id, task.id);
  const current = byTask.get(task.id) ?? [];
  const back = useBack(() => navigate({ to: "/" }));

  const menu = [
    { label: "History", icon: "history", onClick: () => navigate({ to: "/tasks/$taskId/history", params: { taskId: task.id } }) },
    ...(isDom
      ? [
          { label: "Edit", icon: "edit", onClick: () => navigate({ to: "/tasks/$taskId/edit", params: { taskId: task.id } }) },
          {
            label: "Delete",
            icon: "delete",
            danger: true,
            onClick: () =>
              confirm(`Delete “${task.title}”? Upcoming occurrences are removed; finished ones stay in the history.`, () =>
                del.mutate(task.id, {
                  onSuccess: () => {
                    snack("Task deleted");
                    back();
                  },
                  onError: (e) => snack(errorMessage(e)),
                }),
              ),
          },
        ]
      : []),
  ];

  const s = stats.data;
  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-1 bg-surface px-2 md:px-4">
        <IconButton icon="arrow_back" label="Back" onClick={back} />
        <div className="flex-1" />
        {isDom && <IconButton icon="edit" label="Edit" onClick={() => navigate({ to: "/tasks/$taskId/edit", params: { taskId: task.id } })} />}
        <OverflowMenu items={menu} />
      </header>
      <article className="flex flex-col gap-3 px-4 pb-6 md:px-6">
        <h1 className="text-headline-medium text-on-surface">{task.title}</h1>
        <p className="text-body-large text-on-surface-variant">
          {task.summary}
          {task.dueTime ? ` at ${fmtClock(task.dueTime)}` : ", all day"} · {memberName(task.assigneeId)}
        </p>
        <div className="flex flex-wrap gap-2 empty:hidden">
          {task.assignedConsequenceId && <Badge tone="error">Consequence</Badge>}
          {!task.active && <Badge tone="neutral">Paused</Badge>}
          {features.points && task.points !== 0 && <Badge tone="primary">{task.points > 0 ? `+${task.points}` : task.points} pts</Badge>}
          {task.approvalRequired && <Badge tone="tertiary">Needs approval</Badge>}
          {task.proofRequired && <Badge tone="tertiary">Proof required</Badge>}
        </div>
      </article>

      {s && (
        <dl className="mx-4 mb-6 grid grid-cols-3 gap-2 md:mx-6 md:max-w-xl">
          <Stat label="Done" value={s.rate === null ? "–" : `${Math.round(s.rate * 100)}%`} sub={`${s.done} of ${s.done + s.missed}`} />
          <Stat label="Streak" value={String(s.streak)} sub={`Best ${s.bestStreak}`} />
          <Stat label="Last done" value={s.lastDoneAt ? fmtRelative(s.lastDoneAt) : "Never"} sub={s.missed ? `${s.missed} missed` : "None missed"} />
        </dl>
      )}

      <section className="px-4 pb-6 md:px-6">
        <h2 className="mb-2 text-title-medium text-on-surface-variant">Now</h2>
        {query.isLoading && <Loading />}
        {query.data && !current.length && <p className="text-body-medium text-on-surface-variant">Nothing due in the next week.</p>}
        <div className="grid gap-2 lg:grid-cols-2">
          {current.map((o) => (
            <OccurrenceCard key={o.id} o={o} showDate linkTask={false} />
          ))}
        </div>
      </section>

      {task.bodyMd && (
        <section className="px-4 pb-10 md:px-6">
          <h2 className="mb-2 text-title-medium text-on-surface-variant">Details</h2>
          <MarkdownEditor value={task.bodyMd} onChange={() => {}} editable={false} bare />
        </section>
      )}
      {confirmEl}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-md bg-surface-container-low px-3 py-3">
      <dt className="text-label-medium text-on-surface-variant">{label}</dt>
      <dd className="truncate text-title-large text-on-surface">{value}</dd>
      <dd className="truncate text-body-small text-on-surface-variant">{sub}</dd>
    </div>
  );
}

export function TaskHistoryPage({ taskId }: { taskId: string }) {
  const { task, gate } = useTask(taskId);
  const navigate = useNavigate();
  const back = useBack(() => navigate({ to: "/tasks/$taskId", params: { taskId } }));
  if (gate) return gate;
  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-1 bg-surface px-2 md:px-4">
        <IconButton icon="arrow_back" label="Back" onClick={back} />
        <h1 className="flex-1 truncate text-title-large text-on-surface">{task!.title}</h1>
      </header>
      <TaskHistory taskId={taskId} />
    </div>
  );
}
