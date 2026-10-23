import { CountRing, canCount, isCounted, useCountTap } from "../components/Count";
import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useDeleteTask, useSendDrafts, useTasks } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Occurrence, Task } from "../api/types";
import { CompleteDialog, isOverdue } from "../components/OccurrenceCard";
import { RitualDialog, isRitual } from "../components/Ritual";
import { Badge, Button, Chip, Empty, ErrorBox, Fab, Icon, IconButton, Loading, PageHeader, TextField, useSnackbar } from "../components/ui";
import { useCurrentOccurrences } from "../lib/currentOccurrences";
import { StreakStrip } from "../components/StreakStrip";
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
  const drafts = (tasks.data ?? []).filter((t) => t.draft);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (tasks.data ?? [])
      .filter((t) => !t.draft)
      .filter((t) => !needle || t.title.toLowerCase().includes(needle) || t.summary.toLowerCase().includes(needle))
      .filter((t) => !mineOnly || t.assigneeId === me.user.id)
      .sort((a, b) => Number(b.active) - Number(a.active) || a.title.localeCompare(b.title));
  }, [tasks.data, q, mineOnly, me.user.id]);

  return (
    <>
      <PageHeader
        title="Tasks"
        subtitle={isDom ? "Everything you've set, recurring or one-off." : "What's been set for you."}
        actions={
          isDom ? (
            <Button variant="text" icon="widgets" onClick={() => navigate({ to: "/kits" })}>
              Starter kits
            </Button>
          ) : undefined
        }
      />
      <div className="flex flex-wrap items-center gap-2 px-4 pb-4 md:px-6">
        <TextField placeholder="Search tasks" value={q} onChange={(e) => setQ(e.target.value)} className="min-w-0 flex-1" aria-label="Search tasks" />
        <Chip selected={mineOnly} onClick={() => setMineOnly((v) => !v)}>
          Assigned to me
        </Chip>
      </div>
      {drafts.length > 0 && <KitReview drafts={drafts} />}
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
                <Icon
                  name={
                    t.assignedConsequenceId
                      ? "bolt"
                      : t.steps.length
                        ? "format_list_numbered"
                        : t.schedule.rule
                          ? t.schedule.anchor === "completion"
                            ? "autorenew"
                            : "event_repeat"
                          : "event"
                  }
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-title-medium text-on-surface">{t.title}</div>
                <div className="truncate text-body-medium text-on-surface-variant">
                  {t.summary}
                  {t.dueTime ? ` at ${fmtClock(t.dueTime)}` : ""} · {memberName(t.assigneeId)}
                </div>
                <StreakStrip taskId={t.id} className="mt-1.5" />
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
      {completing && !isRitual(completing) && <CompleteDialog o={completing} open onClose={() => setCompleting(null)} />}
      {completing && isRitual(completing) && <RitualDialog o={completing} open onClose={() => setCompleting(null)} />}
      {isDom && <Fab icon="add" label="New task" onClick={() => navigate({ to: "/tasks/$taskId", params: { taskId: "new" } })} />}
    </>
  );
}

/** Tasks just added from a kit, for the Dominant to look over (edit, or drop) before whoever they're for gets them. */
function KitReview({ drafts }: { drafts: Task[] }) {
  const { rel, memberName } = useRel();
  const navigate = useNavigate();
  const snack = useSnackbar();
  const send = useSendDrafts(rel.id);
  const remove = useDeleteTask(rel.id);
  const who = [...new Set(drafts.map((t) => memberName(t.assigneeId)))].join(" and ");
  const edit = (t: Task) => navigate({ to: "/tasks/$taskId/edit", params: { taskId: t.id } });
  return (
    <section aria-label="From a kit" className="mx-4 mb-4 flex flex-col gap-3 rounded-xl bg-tertiary-container p-4 text-on-tertiary-container md:mx-6">
      <div>
        <h2 className="text-title-medium">Look these over before {who} gets them</h2>
        <p className="text-body-medium opacity-85">Added from a kit. Change or drop any of them, then send. {who} hears once, when you do.</p>
      </div>
      <div className="flex flex-col gap-px overflow-hidden rounded-lg">
        {drafts.map((t) => (
          <div key={t.id} className="flex items-center gap-1 bg-surface-container-low pr-1 text-on-surface">
            <button type="button" onClick={() => edit(t)} className="state-layer flex min-w-0 flex-1 flex-col items-start px-4 py-3 text-left">
              <span className="truncate text-body-large">{t.title}</span>
              <span className="truncate text-body-medium text-on-surface-variant">
                {t.summary}
                {t.dueTime ? ` at ${fmtClock(t.dueTime)}` : ""}
              </span>
            </button>
            <IconButton icon="edit" label={`Edit “${t.title}”`} onClick={() => edit(t)} />
            <IconButton
              icon="delete"
              label={`Drop “${t.title}”`}
              disabled={remove.isPending}
              onClick={() => remove.mutate(t.id, { onSuccess: () => snack(`Dropped “${t.title}”`), onError: (e) => snack(errorMessage(e)) })}
            />
          </div>
        ))}
      </div>
      <div>
        <Button
          icon="send"
          busy={send.isPending}
          onClick={() => send.mutate(undefined, { onSuccess: (sent) => snack(`Sent ${sent.length} task${sent.length === 1 ? "" : "s"} to ${who}`), onError: (e) => snack(errorMessage(e)) })}
        >
          Send to {who}
        </Button>
      </div>
    </section>
  );
}

/** Today's state for a task, with a one-tap Done when it's the viewer's to do. */
function NowStatus({ occurrences, mine, onComplete }: { occurrences: Occurrence[]; mine: boolean; onComplete(o: Occurrence): void }) {
  const t = today();
  const countTap = useCountTap();
  const open = occurrences.find((o) => o.status === "pending" && (isOverdue(o) || localDateOf(new Date(o.dueAt)) === t));
  if (open && isCounted(open)) return <CountRing o={open} onTap={mine && canCount(open, true, false) ? () => countTap(open) : undefined} disabled={!mine} />;
  if (open && mine)
    return (
      <IconButton
        icon={isRitual(open) ? "play_circle" : "check_circle"}
        label={`${isRitual(open) ? "Start" : "Mark"} “${open.title}”${isRitual(open) ? "" : " done"}`}
        className={isOverdue(open) ? "text-error" : "text-primary"}
        onClick={() => onComplete(open)}
      />
    );
  const todays = occurrences.find((o) => localDateOf(new Date(o.dueAt)) === t);
  if (todays?.status === "completed") return <Icon name="check_circle" filled className="m-2 text-primary" />;
  if (occurrences.some((o) => o.status === "submitted")) return <Icon name="hourglass_top" className="m-2 text-tertiary" />;
  if (open) return <Icon name="radio_button_unchecked" className={isOverdue(open) ? "m-2 text-error" : "m-2 text-on-surface-variant"} />;
  const next = occurrences.find((o) => o.status === "pending");
  return next ? (
    <span className="w-10 text-center text-label-small text-on-surface-variant">{fmtDate(localDateOf(new Date(next.dueAt)), { weekday: "short" })}</span>
  ) : (
    <span className="w-10" />
  );
}
