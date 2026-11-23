import { CountRing, canCount, isCounted, readyToSend, useCountTap } from "../components/Count";
import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useDeleteTask, useSendDrafts, useTasks } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Occurrence, Task } from "../api/types";
import { CompleteDialog, isOverdue } from "../components/OccurrenceCard";
import { RitualDialog, isRitual } from "../components/Ritual";
import { Button, Chip, Empty, ErrorBox, Fab, Icon, IconButton, Loading, PageHeader, TextField, useSnackbar } from "../components/ui";
import { useCurrentOccurrences } from "../lib/currentOccurrences";
import { fmtClock, localDateOf, today } from "../lib/dates";
import { useRel } from "../lib/relationship";

type Filter = "theirs" | "mine" | "paused" | null;

export function TasksPage() {
  const { rel, isDom, memberName, me } = useRel();
  const tasks = useTasks(rel.id);
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [filter, setFilter] = useState<Filter>(null);
  const { byTask } = useCurrentOccurrences();
  const [completing, setCompleting] = useState<Occurrence | null>(null);
  const drafts = (tasks.data ?? []).filter((t) => t.draft);
  // A Dominant sees whose tasks they are; with one submissive the chip names them.
  const others = rel.members.filter((m) => m.userId !== me.user.id);
  const theirLabel = others.length === 1 ? `Assigned to ${others[0]!.displayName}` : "Assigned to others";

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (tasks.data ?? [])
      .filter((t) => !t.draft)
      .filter((t) => !needle || t.title.toLowerCase().includes(needle) || t.summary.toLowerCase().includes(needle))
      .filter((t) => (filter === "mine" ? t.assigneeId === me.user.id : filter === "theirs" ? t.assigneeId !== me.user.id : filter === "paused" ? !t.active : true))
      .sort((a, b) => Number(b.active) - Number(a.active) || a.title.localeCompare(b.title));
  }, [tasks.data, q, filter, me.user.id]);
  const chip = (f: Exclude<Filter, null>, label: string) => (
    <Chip key={f} selected={filter === f} onClick={() => setFilter((v) => (v === f ? null : f))}>
      {label}
    </Chip>
  );

  return (
    <>
      <PageHeader title="All tasks" tools={<IconButton icon="search" label="Search tasks" onClick={() => setSearching((v) => !v)} />} />
      <div className="flex flex-col gap-3 px-4 pb-2 md:px-6">
        {(searching || q) && (
          <TextField autoFocus placeholder="Search tasks" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tasks" />
        )}
        <div className="flex flex-wrap gap-2">
          {isDom && others.length > 0 && chip("theirs", theirLabel)}
          {chip("mine", "Mine")}
          {chip("paused", "Paused")}
        </div>
      </div>
      {drafts.length > 0 && <KitReview drafts={drafts} />}
      {tasks.isLoading && <Loading />}
      {tasks.error && <ErrorBox error={tasks.error} onRetry={() => tasks.refetch()} />}
      {tasks.data && !list.length && (
        <div className="px-4 md:px-6">
          <Empty icon="checklist" title={q || filter ? "No matches" : "No tasks yet"} body={isDom ? "Start one with the + above." : "Nothing has been set for you yet."} />
        </div>
      )}
      <ul className="px-4 md:px-6">
        {list.map((t) => {
          const mine = t.assigneeId === me.user.id;
          return (
            <li key={t.id} className="flex items-center gap-2 border-b border-outline-variant">
              <button
                type="button"
                onClick={() => navigate({ to: "/tasks/$taskId", params: { taskId: t.id } })}
                className="state-layer flex min-w-0 flex-1 items-center gap-3 py-3.5 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className={t.active ? "block truncate text-body-large text-on-surface" : "block truncate text-body-large text-on-surface-variant"}>{t.title}</span>
                  <span className="block truncate text-body-medium text-on-surface-variant">
                    {t.summary}
                    {t.dueTime ? ` at ${fmtClock(t.dueTime)}` : ""}
                    {!mine && others.length > 1 ? ` · ${memberName(t.assigneeId)}` : ""}
                  </span>
                </span>
                {!t.active && <span className="shrink-0 text-body-small text-on-surface-variant">paused</span>}
              </button>
              <NowStatus occurrences={byTask.get(t.id) ?? []} mine={mine} onComplete={setCompleting} />
            </li>
          );
        })}
      </ul>
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
  if (open && isCounted(open)) return <CountRing o={open} onTap={mine && canCount(open, true, false) && !readyToSend(open) ? () => countTap(open) : undefined} disabled={!mine} />;
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
  if (open && isOverdue(open)) return <span className="shrink-0 text-body-small text-error">overdue</span>;
  return null;
}
