import { useNavigate } from "@tanstack/react-router";
import type { Occurrence, Task } from "../api/types";
import { useDeleteTask, useOccurrences, useTaskStats, useTasks } from "../api/hooks";
import { errorMessage } from "../api/client";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { OccurrenceCard, isOverdue } from "../components/OccurrenceCard";
import { useCurrentOccurrences } from "../lib/currentOccurrences";
import { TaskHistory } from "../components/TaskHistory";
import { BackLink, Diamond, type DiamondState, ErrorBox, IconButton, Loading, OverflowMenu, useSnackbar, cx } from "../components/ui";
import { addDays, daysBetween, fmtClock, fmtDate, fmtRelative, localDateOf, startOfWeek, today } from "../lib/dates";
import { useRel } from "../lib/relationship";
import { useBack } from "../lib/useBack";
import { useConfirm } from "../lib/useConfirm";

function useTask(taskId: string) {
  const { rel } = useRel();
  const tasks = useTasks(rel.id);
  const task = tasks.data?.find((t) => t.id === taskId);
  const gate = tasks.isLoading ? (
    <Loading />
  ) : tasks.error ? (
    <ErrorBox error={tasks.error} onRetry={() => tasks.refetch()} />
  ) : !task ? (
    <ErrorBox error="That task doesn't exist any more." />
  ) : null;
  return { task, gate };
}

/** One task: what it is, how it's going, and what's due now. History and editing live under the ⋮ menu. */
/** `onClose` shows it as Today's side panel on wide screens: a close button instead of back, plus open-as-page. */
export function TaskPage({ taskId, onClose }: { taskId: string; onClose?: () => void }) {
  const { task, gate } = useTask(taskId);
  return gate ?? <TaskView task={task!} onClose={onClose} />;
}

function TaskView({ task, onClose }: { task: Task; onClose?: () => void }) {
  const { rel, me, isDom, memberName, features } = useRel();
  const navigate = useNavigate();
  const snack = useSnackbar();
  const del = useDeleteTask(rel.id);
  const [confirm, confirmEl] = useConfirm();
  const { byTask, query } = useCurrentOccurrences();
  const stats = useTaskStats(rel.id, task.id);
  const current = byTask.get(task.id) ?? [];
  const back = useBack(() => navigate({ to: "/" }));

  const menu = [
    ...(isDom ? [{ label: "Edit", icon: "edit", onClick: () => navigate({ to: "/tasks/$taskId/edit", params: { taskId: task.id } }) }] : []),
    ...(isDom
      ? [
          {
            label: "Delete",
            icon: "delete",
            danger: true,
            onClick: () =>
              confirm(`Delete “${task.title}”? Upcoming occurrences are removed; finished ones stay in the history.`, () =>
                del.mutate(task.id, {
                  onSuccess: () => {
                    snack("Task deleted");
                    // Back to the list of tasks, wherever it was opened from.
                    void navigate({ to: "/tasks", replace: true });
                  },
                  onError: (e) => snack(errorMessage(e)),
                }),
              ),
          },
        ]
      : []),
  ];

  const s = stats.data;
  const eyebrow = [
    `${task.summary}${task.dueTime ? ` by ${fmtClock(task.dueTime)}` : ", all day"}`,
    task.assigneeId !== me.user.id ? memberName(task.assigneeId) : null,
    features.points && task.points !== 0 ? `${task.points > 0 ? "+" : ""}${task.points}` : null,
    task.assignedConsequenceId ? "consequence" : null,
    task.approvalRequired ? "approved by you" : null,
    task.proofRequired ? "with a photo" : null,
    !task.active ? "paused" : null,
  ].filter(Boolean);
  return (
    <div className="flex flex-col">
      <header className={cx("flex min-h-10 items-center gap-1 px-2 pt-3 md:px-4 md:pt-6", onClose && "sticky top-0 z-20 bg-surface")}>
        <div className="min-w-0 flex-1 pl-2">{!onClose && <BackLink label="Back" onClick={back} />}</div>
        <IconButton icon="history" label="History" onClick={() => navigate({ to: "/tasks/$taskId/history", params: { taskId: task.id } })} />
        {onClose && <IconButton icon="open_in_full" label="Open as a page" onClick={() => navigate({ to: "/tasks/$taskId", params: { taskId: task.id } })} />}
        {menu.length > 0 && <OverflowMenu items={menu} />}
        {onClose && <IconButton icon="close" label="Close" onClick={onClose} />}
      </header>
      <div className="flex max-w-3xl flex-col px-4 pb-10 md:px-6 lg:px-16">
        <p className="mt-4 text-label-medium tracking-[0.12em] text-on-surface-variant uppercase">{eyebrow.join(" · ")}</p>
        <h1 className="mt-1 font-serif text-[46px] leading-[1.05] text-on-surface md:text-[56px]">{task.title}</h1>

        {query.isLoading && <Loading />}
        {query.data && !current.length && <p className="mt-4 text-body-large text-on-surface-variant">Nothing due in the next week.</p>}
        <div className="mt-2 flex flex-col divide-y divide-outline-variant">
          {current.map((o) => (
            <OccurrenceCard key={o.id} o={o} plain linkTask={false} />
          ))}
        </div>

        <ThisWeek taskId={task.id} />

        {s && (
          <dl className="mt-8 grid grid-cols-3 gap-4">
            <Stat label="done" value={s.rate === null ? "–" : `${Math.round(s.rate * 100)}%`} sub={`${s.done} of ${s.done + s.missed}`} />
            <Stat label="streak" value={String(s.streak)} sub={`best ${s.bestStreak}`} />
            <Stat label="missed" value={String(s.missed)} sub={s.lastDoneAt ? `last done ${fmtRelative(s.lastDoneAt)}` : "never done yet"} />
          </dl>
        )}

        {task.bodyMd && (
          <section className="mt-8">
            <h2 className="mb-2 text-label-medium tracking-[0.12em] text-on-surface-variant uppercase">Details</h2>
            <MarkdownEditor value={task.bodyMd} onChange={() => {}} editable={false} bare />
          </section>
        )}
      </div>
      {confirmEl}
    </div>
  );
}

/** This week as a row of diamonds, one per day the task falls on, as in the mockup. */
function ThisWeek({ taskId }: { taskId: string }) {
  const { rel, me } = useRel();
  const from = startOfWeek(today(), me.user.weekStart ?? "sun");
  const days = daysBetween(from, addDays(from, 6));
  const occ = useOccurrences(rel.id, from, days[6]!);
  const mine = (occ.data ?? []).filter((o) => o.seriesId === taskId && o.status !== "cancelled");
  if (!mine.length) return null;
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-label-medium tracking-[0.12em] text-on-surface-variant uppercase">This week</h2>
      <div className="grid grid-cols-7 text-center">
        {days.map((d) => {
          const o = mine.find((x) => localDateOf(new Date(x.dueAt)) === d);
          return (
            <div key={d} className="flex flex-col items-center gap-1.5">
              {o ? <Diamond state={diamondState(o)} size={14} /> : <span className="h-[14px]" />}
              <span className="text-label-small text-on-surface-variant">{fmtDate(d, { weekday: "narrow" })}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function diamondState(o: Occurrence): DiamondState {
  if (o.status === "completed") return "done";
  if (o.status === "missed" || isOverdue(o)) return "owed";
  if (o.status === "submitted") return "waiting";
  if (o.status === "excused") return "off";
  return "open";
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="min-w-0">
      <dd className="font-serif text-[34px] leading-none text-on-surface">{value}</dd>
      <dt className="mt-1 text-label-medium text-on-surface-variant">{label}</dt>
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
    <div className="flex flex-col px-4 pb-10 md:px-6 lg:px-16">
      <header className="flex min-h-10 items-center gap-1 pt-3 md:pt-6">
        <div className="min-w-0 flex-1">
          <BackLink label={task!.title} onClick={back} />
        </div>
      </header>
      <h1 className="mt-4 mb-4 font-serif text-[46px] leading-[1.05] text-on-surface md:text-[56px]">History</h1>
      <div className="max-w-3xl">
        <TaskHistory taskId={taskId} />
      </div>
    </div>
  );
}
