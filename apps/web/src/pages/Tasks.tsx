import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTasks } from "../api/hooks";
import type { Occurrence } from "../api/types";
import { CompleteDialog, isOverdue } from "../components/OccurrenceCard";
import { Badge, Chip, Empty, ErrorBox, Fab, Icon, IconButton, Loading, PageHeader, TextField } from "../components/ui";
import { useCurrentOccurrences } from "../lib/currentOccurrences";
import { fmtClock, fmtDate, localDateOf, today } from "../lib/dates";
import { useRel } from "../lib/relationship";

export function TasksPage() {
  const { rel, isDom, memberName, me, features } = useRel();
  const tasks = useTasks(rel.id);
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const { byTask } = useCurrentOccurrences();
  const [completing, setCompleting] = useState<Occurrence | null>(null);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (tasks.data ?? [])
      .filter((t) => !needle || t.title.toLowerCase().includes(needle) || t.summary.toLowerCase().includes(needle))
      .filter((t) => !mineOnly || t.assigneeId === me.user.id)
      .sort((a, b) => Number(b.active) - Number(a.active) || a.title.localeCompare(b.title));
  }, [tasks.data, q, mineOnly, me.user.id]);

  return (
    <>
      <PageHeader title="Tasks" subtitle={isDom ? "Everything you've set, recurring or one-off." : "What's been set for you."} />
      <div className="flex flex-wrap items-center gap-2 px-4 pb-4 md:px-6">
        <TextField placeholder="Search tasks" value={q} onChange={(e) => setQ(e.target.value)} className="min-w-0 flex-1" aria-label="Search tasks" />
        <Chip selected={mineOnly} onClick={() => setMineOnly((v) => !v)}>
          Assigned to me
        </Chip>
      </div>
      {tasks.isLoading && <Loading />}
      {tasks.error && <ErrorBox error={tasks.error} onRetry={() => tasks.refetch()} />}
      {tasks.data && !list.length && (
        <div className="px-4 md:px-6">
          <Empty
            icon="checklist"
            title={q ? "No matches" : "No tasks yet"}
            body={isDom ? "Create one with the button below: daily rituals, chores, lines to write, anything." : "Your Dominant hasn't set any tasks yet."}
          />
        </div>
      )}
      <div className="flex flex-col gap-2 px-4 md:px-6">
        {list.map((t) => (
          <div key={t.id} className="flex items-center gap-1 rounded-md bg-surface-container-low pr-2">
            <button
              type="button"
              onClick={() => navigate({ to: "/tasks/$taskId", params: { taskId: t.id } })}
              className="state-layer flex min-w-0 flex-1 items-center gap-4 rounded-md p-4 text-left"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
                <Icon name={t.schedule.rule ? (t.schedule.anchor === "completion" ? "autorenew" : "event_repeat") : "event"} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-title-medium text-on-surface">{t.title}</div>
                <div className="truncate text-body-medium text-on-surface-variant">
                  {t.summary}
                  {t.dueTime ? ` at ${fmtClock(t.dueTime)}` : ""} · {memberName(t.assigneeId)}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                {features.points && t.points !== 0 && <Badge>{t.points > 0 ? `+${t.points}` : t.points} pts</Badge>}
                {!t.active && <Badge tone="neutral">Paused</Badge>}
                {t.approvalRequired && <Icon name="verified" size={18} className="text-on-surface-variant" />}
              </div>
            </button>
            <NowStatus occurrences={byTask.get(t.id) ?? []} mine={t.assigneeId === me.user.id} onComplete={setCompleting} />
          </div>
        ))}
      </div>
      {completing && <CompleteDialog o={completing} open onClose={() => setCompleting(null)} />}
      {isDom && <Fab icon="add" label="New task" onClick={() => navigate({ to: "/tasks/$taskId", params: { taskId: "new" } })} />}
    </>
  );
}

/** Today's state for a task, with a one-tap Done when it's the viewer's to do. */
function NowStatus({ occurrences, mine, onComplete }: { occurrences: Occurrence[]; mine: boolean; onComplete(o: Occurrence): void }) {
  const t = today();
  const open = occurrences.find((o) => o.status === "pending" && (isOverdue(o) || localDateOf(new Date(o.dueAt)) === t));
  if (open && mine) return <IconButton icon="check_circle" label={`Mark “${open.title}” done`} className={isOverdue(open) ? "text-error" : "text-primary"} onClick={() => onComplete(open)} />;
  const todays = occurrences.find((o) => localDateOf(new Date(o.dueAt)) === t);
  if (todays?.status === "completed") return <Icon name="check_circle" filled className="m-2 text-primary" />;
  if (occurrences.some((o) => o.status === "submitted")) return <Icon name="hourglass_top" className="m-2 text-tertiary" />;
  if (open) return <Icon name="radio_button_unchecked" className={isOverdue(open) ? "m-2 text-error" : "m-2 text-on-surface-variant"} />;
  const next = occurrences.find((o) => o.status === "pending");
  return next ? <span className="w-10 text-center text-label-small text-on-surface-variant">{fmtDate(localDateOf(new Date(next.dueAt)), { weekday: "short" })}</span> : <span className="w-10" />;
}
