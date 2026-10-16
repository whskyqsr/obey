import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTasks } from "../api/hooks";
import { Badge, Chip, Empty, ErrorBox, Fab, Icon, Loading, PageHeader, TextField } from "../components/ui";
import { useRel } from "../lib/relationship";

export function TasksPage() {
  const { rel, isDom, memberName, me } = useRel();
  const tasks = useTasks(rel.id);
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [mineOnly, setMineOnly] = useState(false);

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
          <button
            key={t.id}
            type="button"
            onClick={() => navigate({ to: "/tasks/$taskId", params: { taskId: t.id } })}
            className="state-layer flex items-center gap-4 rounded-md bg-surface-container-low p-4 text-left"
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
              <Icon name={t.schedule.rule ? (t.schedule.anchor === "completion" ? "autorenew" : "event_repeat") : "event"} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-title-medium text-on-surface">{t.title}</div>
              <div className="truncate text-body-medium text-on-surface-variant">
                {t.summary}
                {t.dueTime ? ` at ${t.dueTime}` : ""} · {memberName(t.assigneeId)}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              {t.points !== 0 && <Badge>{t.points > 0 ? `+${t.points}` : t.points} pts</Badge>}
              {!t.active && <Badge tone="neutral">Paused</Badge>}
              {t.approvalRequired && <Icon name="verified" size={18} className="text-on-surface-variant" />}
            </div>
          </button>
        ))}
      </div>
      {isDom && <Fab icon="add" label="New task" onClick={() => navigate({ to: "/tasks/$taskId", params: { taskId: "new" } })} />}
    </>
  );
}
