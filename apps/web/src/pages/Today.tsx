import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useNoteAfter } from "../components/DecisionNote";
import { useBalances, useDecideReschedule, useEvents, useLibrary, usePendingReschedules } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { CalendarEvent, Occurrence, RescheduleRequest } from "../api/types";
import { EventDialog, eventOn, eventWhen } from "../components/EventDialog";
import { DayRescheduleSheet } from "../components/DayRescheduleSheet";
import { isOverdue } from "../components/OccurrenceCard";
import { MissActions, ReviewActions, RowGroup, RowLink, TaskRow } from "../components/TaskRow";
import { CurfewStrip } from "../components/CurfewStrip";
import { PlanChanges } from "../components/PlanChanges";
import { DelayCards, MoodRow, RedemptionRow } from "../components/NeedsYou";
import { KitPrompt } from "./Kits";
import { Button, Dialog, Empty, ErrorBox, Fab, Icon, IconButton, Loading, PageHeader, Section, TextField, useSnackbar, cx } from "../components/ui";
import { addDays, fmtDate, fmtDateTime, fmtRelative, fromLocalInput, localDateOf, toLocalInput, today } from "../lib/dates";
import { useRel } from "../lib/relationship";
import { planTone } from "../lib/planColors";
import { WIDE, useMediaQuery } from "../lib/useMediaQuery";
import { useNeedsYou, useTodayOccurrences } from "../lib/today";
import { AgreementCard } from "../components/AgreementCard";

const byDue = (a: Occurrence, b: Occurrence) => a.dueAt.localeCompare(b.dueAt);
const dueDay = (o: Occurrence) => localDateOf(new Date(o.dueAt));

export function TodayPage({ selected, renderTask }: { selected?: string; renderTask?(id: string, close: () => void): ReactNode }) {
  const { me, isDom, features, rel, memberName } = useRel();
  const navigate = useNavigate();
  const t = today();
  const occ = useTodayOccurrences();
  const needs = useNeedsYou();

  const groups = useMemo(() => {
    const list = (occ.data ?? []).filter((o) => o.status !== "cancelled");
    const now = Date.now();
    const later = new Map<string, Occurrence[]>();
    for (const o of list.filter((o) => dueDay(o) > t && o.status === "pending").sort(byDue)) later.set(dueDay(o), [...(later.get(dueDay(o)) ?? []), o]);
    return {
      overdue: list.filter((o) => isOverdue(o, now) && dueDay(o) < t).sort(byDue),
      today: list.filter((o) => dueDay(o) === t).sort(byDue),
      later: [...later.entries()].slice(0, 3),
    };
  }, [occ.data, t]);

  const [daySheet, setDaySheet] = useState(false);
  const pending = usePendingReschedules(rel.id);
  // Whole-day extensions cover the user's own open tasks for today; ones already asked about aren't offered again.
  const myOpenToday = useMemo(() => {
    const asked = new Set((pending.data ?? []).map((r) => r.occurrenceId));
    return groups.today.filter((o) => o.status === "pending" && o.assigneeId === me.user.id && !asked.has(o.id));
  }, [groups.today, me.user.id, pending.data]);
  const name = me.user.displayName.split(" ")[0];

  // The Dom's "Needs you" rows are taken out of the rest of today.
  const decided = new Set([...needs.review, ...needs.missed].map((o) => o.id));
  const restOfToday = isDom ? groups.today.filter((o) => !decided.has(o.id)) : groups.today;
  const todays = groups.today.filter((o) => o.status !== "excused");
  const doneToday = todays.filter((o) => o.status === "completed" || o.status === "submitted").length;
  const partner = rel.members.find((m) => m.userId !== me.user.id);
  const wide = useMediaQuery(WIDE);
  const newTask = () => navigate({ to: "/tasks/$taskId", params: { taskId: "new" } });
  useRowShortcuts(isDom ? newTask : undefined);

  return (
    <RowLink.Provider value={wide ? (id) => ({ to: "/", search: { task: id }, current: id === selected }) : null}>
      <div className="xl:flex xl:items-start">
        <div className="min-w-0 flex-1 xl:mx-auto xl:max-w-4xl">
          <PageHeader
            actions={
              isDom && wide ? (
                <Button variant="tonal" icon="add" onClick={newTask}>
                  New task
                </Button>
              ) : undefined
            }
            title={`Hi${name ? `, ${name}` : ""}`}
            subtitle={[
              fmtDate(t, { weekday: "long", month: "long", day: "numeric" }),
              isDom && partner && todays.length ? `${memberName(partner.userId)} has done ${doneToday} of ${todays.length}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          />
          <CurfewStrip />
          <PlanChanges />
          <AgreementCard />
          {isDom && <DelayCards />}
          {!isDom && occ.data && todays.length > 0 && <Progress today={todays} done={doneToday} points={features.points} />}
          <PlanClashes />
          <KitPrompt />
          {isDom ? (
            <>
              {needs.count > 0 && (
                <Section title={`Needs you · ${needs.count}`}>
                  <div className="flex flex-col gap-2">
                    <PendingRequests bare />
                    {(needs.review.length > 0 || needs.missed.length > 0 || needs.lowMoods.length > 0 || needs.redemptions.length > 0) && (
                      <RowGroup>
                        {needs.lowMoods.map((o) => (
                          <MoodRow key={`mood-${o.id}`} o={o} />
                        ))}
                        {needs.review.map((o) => (
                          <TaskRow key={o.id} o={o} showDate={dueDay(o) !== t} actions={<ReviewActions o={o} />} />
                        ))}
                        {needs.missed.map((o) => (
                          <TaskRow key={o.id} o={o} showDate={dueDay(o) !== t} actions={<MissActions o={o} />} />
                        ))}
                        {needs.redemptions.map((e) => (
                          <RedemptionRow key={e.id} e={e} />
                        ))}
                      </RowGroup>
                    )}
                  </div>
                </Section>
              )}
            </>
          ) : (
            <PendingRequests />
          )}
          {occ.isLoading && <Loading />}
          {occ.error && <ErrorBox error={occ.error} onRetry={() => occ.refetch()} />}
          {occ.data && (
            <>
              {groups.overdue.length > 0 && (
                <Section title="Overdue">
                  <RowGroup>
                    {groups.overdue.map((o) => (
                      <TaskRow key={o.id} o={o} showDate />
                    ))}
                  </RowGroup>
                </Section>
              )}
              <Section
                title={isDom && needs.count > 0 ? "Rest of today" : "Today"}
                action={
                  myOpenToday.length > 1 ? (
                    <Button variant="text" icon="more_time" onClick={() => setDaySheet(true)}>
                      More time
                    </Button>
                  ) : undefined
                }
              >
                {restOfToday.length ? (
                  <RowGroup>
                    {restOfToday.map((o) => (
                      <TaskRow key={o.id} o={o} />
                    ))}
                  </RowGroup>
                ) : (
                  <Empty
                    icon="spa"
                    title="Nothing due today"
                    body={rel.endedAt ? "This dynamic has ended." : isDom ? "Add one with the button below." : "Enjoy it while it lasts."}
                  />
                )}
              </Section>
              {groups.later.length > 0 && (
                <Section title="Later">
                  <div className="flex flex-col gap-2">
                    {groups.later.map(([day, items]) => (
                      <LaterDay key={day} day={day} items={items} />
                    ))}
                    <Button variant="text" icon="calendar_month" className="self-start" onClick={() => navigate({ to: "/calendar" })}>
                      See the week
                    </Button>
                  </div>
                </Section>
              )}
            </>
          )}
          {wide && occ.data && <ShortcutHints dom={isDom} />}
          <DayRescheduleSheet tasks={myOpenToday} open={daySheet} onClose={() => setDaySheet(false)} />
          {isDom && <Fab icon="add" label="New task" onClick={newTask} className="xl:hidden" />}
        </div>
        {wide && (
          <aside className="sticky top-0 h-dvh w-[400px] shrink-0 overflow-y-auto bg-surface-container-low" aria-label="Task details">
            {selected && renderTask ? renderTask(selected, () => navigate({ to: "/", search: {} })) : <Glance today={todays} done={doneToday} />}
          </aside>
        )}
      </div>
    </RowLink.Provider>
  );
}

/** With no task selected, the side panel shows the day at a glance and points toward the next reward. */
function Glance({ today: list, done }: { today: Occurrence[]; done: number }) {
  const { rel, me, isDom, features, memberName } = useRel();
  const balances = useBalances(rel.id);
  const rewards = useLibrary(rel.id, "rewards", features.points);
  const earner = isDom ? rel.members.find((m) => m.userId !== me.user.id)?.userId : me.user.id;
  const balance = balances.data?.find((b) => b.userId === earner)?.balance ?? 0;
  const next = (rewards.data ?? []).filter((r) => r.cost > balance).sort((a, b) => a.cost - b.cost)[0];
  return (
    <div className="flex flex-col gap-4 p-6">
      <h2 className="text-title-large text-on-surface">At a glance</h2>
      {list.length > 0 ? <Progress today={list} done={done} points={features.points} /> : <p className="text-body-medium text-on-surface-variant">Nothing due today.</p>}
      {features.points && earner && (
        <div className="rounded-lg bg-surface p-4">
          <div className="text-title-small text-on-surface-variant">{isDom ? `${memberName(earner)}'s points` : "Your points"}</div>
          <div className="text-display-small text-on-surface tabular-nums">{balance}</div>
          {next && (
            <>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-container-highest">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (balance / next.cost) * 100)}%` }} />
              </div>
              <div className="mt-1 text-body-small text-on-surface-variant">
                {next.cost - balance} more for {next.title}
              </div>
            </>
          )}
        </div>
      )}
      <p className="text-body-small text-on-surface-variant">Select a task to see its details here.</p>
    </div>
  );
}

/** J/K move between rows, X marks the focused one done, R asks for more time (a Dominant reschedules), N starts a new task (Dominant). */
function useRowShortcuts(onNew?: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || el.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
      const rows = [...document.querySelectorAll<HTMLElement>("a[data-task-row]")];
      const at = rows.indexOf(el as HTMLElement);
      const key = e.key.toLowerCase();
      if (key === "j" || key === "k") {
        e.preventDefault();
        rows[Math.max(0, Math.min(rows.length - 1, at < 0 ? 0 : at + (key === "j" ? 1 : -1)))]?.focus();
      } else if ((key === "x" || key === "r") && at >= 0) {
        e.preventDefault();
        el.closest("[data-row]")
          ?.querySelector<HTMLElement>(`[data-action=${key === "x" ? "done" : "more"}]`)
          ?.click();
      } else if (key === "n" && onNew) {
        e.preventDefault();
        onNew();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onNew]);
}

function ShortcutHints({ dom }: { dom: boolean }) {
  const keys: [string, string][] = [
    ["J K", "move"],
    ["X", "done"],
    ["R", dom ? "reschedule" : "more time"],
    ...(dom ? ([["N", "new task"]] as [string, string][]) : []),
    ["Enter", "open"],
  ];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 px-6 pb-8 text-body-small text-on-surface-variant">
      {keys.map(([k, what]) => (
        <span key={k} className="flex items-center gap-1">
          {k.split(" ").map((x) => (
            <kbd key={x} className="rounded-xs border border-outline-variant px-1.5 font-sans">
              {x}
            </kbd>
          ))}
          {what}
        </span>
      ))}
    </div>
  );
}

/** "1 of 5 done", what's next and the points still on the table today. */
function Progress({ today: list, done, points }: { today: Occurrence[]; done: number; points: boolean }) {
  const now = Date.now();
  const open = list.filter((o) => o.status === "pending");
  const next = open.find((o) => new Date(o.dueAt).getTime() >= now);
  const left = open.reduce((sum, o) => sum + Math.max(0, o.points), 0);
  const r = 22;
  const c = 2 * Math.PI * r;
  const frac = list.length ? done / list.length : 0;
  return (
    <div className="mx-4 mb-6 flex items-center gap-4 rounded-xl bg-primary-container p-4 text-on-primary-container md:mx-6">
      <svg viewBox="0 0 56 56" className="size-14 shrink-0 -rotate-90" aria-hidden>
        <circle cx="28" cy="28" r={r} fill="none" strokeWidth="6" className="stroke-on-primary-container/15" />
        <circle cx="28" cy="28" r={r} fill="none" strokeWidth="6" strokeLinecap="round" className="stroke-primary" strokeDasharray={`${c * frac} ${c}`} />
      </svg>
      <div className="min-w-0">
        <div className="text-title-large">{done === list.length ? "All done for today" : `${done} of ${list.length} done`}</div>
        <div className="text-body-medium">
          {[next ? `Next: ${next.title} ${fmtRelative(next.dueAt)}` : open.length ? `${open.length} still open` : null, points && left ? `${left} pts left today` : null]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </div>
    </div>
  );
}

/** A later day, collapsed to its task names until opened. */
function LaterDay({ day, items }: { day: string; items: Occurrence[] }) {
  const [open, setOpen] = useState(false);
  const label = day === addDays(today(), 1) ? "Tomorrow" : fmtDate(day, { weekday: "long", month: "short", day: "numeric" });
  return (
    <div className="overflow-hidden rounded-lg bg-surface-container-low">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="state-layer flex w-full items-center gap-3 px-4 py-3 text-left">
        <div className="min-w-0 flex-1">
          <div className="text-title-medium text-on-surface">
            {label} · {items.length} {items.length === 1 ? "task" : "tasks"}
          </div>
          {!open && <div className="truncate text-body-medium text-on-surface-variant">{items.map((o) => o.title).join(", ")}</div>}
        </div>
        <Icon name={open ? "expand_less" : "expand_more"} className="text-on-surface-variant" />
      </button>
      {open && (
        <RowGroup>
          {items.map((o) => (
            <TaskRow key={o.id} o={o} />
          ))}
        </RowGroup>
      )}
    </div>
  );
}

/** One card per request; a whole-day request (shared groupId) is one card listing each task. */
function PendingRequests({ bare }: { bare?: boolean }) {
  const { rel, me, isDom, memberName } = useRel();
  const snack = useSnackbar();
  const pending = usePendingReschedules(rel.id);
  const decide = useDecideReschedule(rel.id);
  const noteAfter = useNoteAfter();

  const cards = useMemo(() => {
    const map = new Map<string, RescheduleRequest[]>();
    for (const r of pending.data ?? []) {
      // The Dom decides others' requests; everyone sees their own as "waiting".
      if (!isDom && r.requestedBy !== me.user.id) continue;
      const key = r.groupId ?? r.id;
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return [...map.values()];
  }, [pending.data, isDom, me.user.id]);

  if (!cards.length) return null;
  const mine = (r: RescheduleRequest) => r.requestedBy === me.user.id;

  const [instead, setInstead] = useState<RescheduleRequest | null>(null);
  const [insteadAt, setInsteadAt] = useState("");

  function act(r: RescheduleRequest, approve: boolean, n: number) {
    decide.mutate(
      { id: r.id, approve },
      {
        onSuccess: () =>
          noteAfter(`${approve ? "Approved" : "Declined"}${n > 1 ? ` ${n} tasks` : ""}`, {
            relId: rel.id,
            occurrenceId: r.occurrenceId,
            to: memberName(r.requestedBy),
            about: `${approve ? "approving" : "declining"} the request for “${r.title}”`,
          }),
        onError: (e) => snack(errorMessage(e)),
      },
    );
  }
  /** "Reschedule instead": the Dom picks the new deadline for this one task, whatever was asked. */
  function openInstead(r: RescheduleRequest) {
    setInsteadAt(toLocalInput(new Date(new Date(r.kind === "cancel" ? r.fromDueAt : r.toDueAt).getTime() + (r.kind === "cancel" ? 86_400_000 : 0)).toISOString()));
    setInstead(r);
  }
  function moveInstead() {
    if (!instead || !insteadAt) return;
    decide.mutate(
      { id: instead.id, approve: true, dueAt: fromLocalInput(insteadAt), item: true },
      { onSuccess: () => (snack(`Moved “${instead.title}”`), setInstead(null)), onError: (e) => snack(errorMessage(e)) },
    );
  }
  const change = (x: RescheduleRequest) => (x.kind === "cancel" ? "Call off" : `${fmtDateTime(x.fromDueAt)} → ${fmtDateTime(x.toDueAt)}`);

  const body = (
    <div className="flex flex-col gap-2">
      {cards.map((rows) => {
        const r = rows[0]!;
        const who = mine(r) ? "You asked" : `${memberName(r.requestedBy)} asks`;
        const single = rows.length === 1;
        const canDecide = isDom && !mine(r);
        return (
          <div key={r.groupId ?? r.id} className="flex flex-col gap-3 rounded-md bg-tertiary-container p-4 text-on-tertiary-container">
            <div>
              <div className="text-title-medium">
                {single && r.kind === "cancel" ? (
                  <>
                    {who} to call off “{r.title}”
                  </>
                ) : single ? (
                  <>
                    {who} for more time on “{r.title}”{r.scope === "following" ? " (this and following)" : ""}
                  </>
                ) : rows.some((x) => x.kind === "cancel") ? (
                  <>
                    {who} about {rows.length} tasks
                  </>
                ) : (
                  <>
                    {who} for more time on {rows.length} tasks today
                  </>
                )}
              </div>
              {single ? (
                <div className="text-body-medium">{r.kind === "cancel" ? `Due ${fmtDateTime(r.fromDueAt)}` : change(r)}</div>
              ) : (
                <ul className="mt-2 flex flex-col gap-1">
                  {rows.map((x) => (
                    <li key={x.id} className="flex flex-wrap items-center justify-between gap-x-3 text-body-medium">
                      <span className="font-medium">{x.title}</span>
                      <span className="flex items-center gap-1">
                        {change(x)}
                        {canDecide && <IconButton icon="edit_calendar" label={`Pick a time for ${x.title}`} onClick={() => openInstead(x)} />}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {r.reason && <div className="mt-2 text-body-medium italic">“{r.reason}”</div>}
            </div>
            {canDecide && (
              <div className="flex flex-wrap gap-2">
                <Button icon="check" disabled={decide.isPending} onClick={() => act(r, true, rows.length)}>
                  {single ? "Approve" : "Approve all"}
                </Button>
                {single && (
                  <Button variant="tonal" icon="edit_calendar" disabled={decide.isPending} onClick={() => openInstead(r)}>
                    {r.kind === "cancel" ? "Reschedule instead" : "Other time"}
                  </Button>
                )}
                <Button variant="text" className="text-on-tertiary-container" disabled={decide.isPending} onClick={() => act(r, false, rows.length)}>
                  Decline
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
  const dialog = (
    <Dialog
      open={instead !== null}
      onClose={() => setInstead(null)}
      title={instead?.kind === "cancel" ? "Reschedule instead" : "Pick another time"}
      actions={
        <>
          <Button variant="text" onClick={() => setInstead(null)}>
            Cancel
          </Button>
          <Button busy={decide.isPending} disabled={!insteadAt} onClick={moveInstead}>
            Move it
          </Button>
        </>
      }
    >
      <p className="mb-3">
        “{instead?.title}” moves to this deadline{instead?.kind === "cancel" ? " instead of being called off" : ""}. The rest of the request stays for you to decide.
      </p>
      <TextField type="datetime-local" label="New deadline" value={insteadAt} onChange={(e) => setInsteadAt(e.target.value)} />
    </Dialog>
  );
  return (
    <>
      {bare ? body : <Section title={isDom ? "Extension requests" : "Waiting for approval"}>{body}</Section>}
      {dialog}
    </>
  );
}

/** A heads-up for plans today or tomorrow that run into tasks, so they get moved before they're missed. */
function PlanClashes() {
  const { rel } = useRel();
  const t = today();
  const events = useEvents(rel.id, t, addDays(t, 1));
  const [open, setOpen] = useState<CalendarEvent | null>(null);
  const clashing = (events.data ?? []).filter((e) => e.conflictIds.length > 0 && new Date(e.endsAt).getTime() > Date.now() && (eventOn(e, t) || eventOn(e, addDays(t, 1))));
  if (!clashing.length) return null;
  return (
    <div className="mx-4 mb-2 flex flex-col gap-2 md:mx-6">
      {clashing.map((e) => (
        <div key={e.id} className={cx("flex items-center gap-3 rounded-md px-4 py-3", planTone(e, rel).bg, planTone(e, rel).text)}>
          <Icon name="event_busy" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-title-small">{e.title}</div>
            <div className="text-body-small opacity-80">
              {eventWhen(e)} · overlaps {e.conflictIds.length === 1 ? "a task" : `${e.conflictIds.length} tasks`}
            </div>
          </div>
          <Button variant="text" onClick={() => setOpen(e)}>
            Sort it out
          </Button>
        </div>
      ))}
      <EventDialog event={open} open={open !== null} onClose={() => setOpen(null)} />
    </div>
  );
}
