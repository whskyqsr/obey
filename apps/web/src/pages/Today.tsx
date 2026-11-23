import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useBalances, useLibrary, usePendingReschedules } from "../api/hooks";
import type { Occurrence } from "../api/types";
import { DayRescheduleSheet } from "../components/DayRescheduleSheet";
import { isOverdue } from "../components/OccurrenceCard";
import { RowGroup, RowLink, TaskRow } from "../components/TaskRow";
import { CurfewStrip } from "../components/CurfewStrip";
import { TodayInbox } from "../components/Inbox";
import { SceneCards } from "../components/SceneCards";
import { RoleSwapCard } from "../components/RoleSwap";
import { ChastityToday } from "../components/Chastity";
import { SoloCards } from "../components/Solo";
import { CountdownCard } from "../components/Countdown";
import { NextUp, pickNext } from "../components/NextUp";
import { KitPrompt } from "./Kits";
import { Button, Empty, ErrorBox, Fab, Icon, Loading, PageHeader, Section } from "../components/ui";
import { addDays, fmtDate, fmtRelative, localDateOf, today } from "../lib/dates";
import { useRel } from "../lib/relationship";
import { WIDE, useMediaQuery } from "../lib/useMediaQuery";
import { useNeedsYou, useTodayOccurrences } from "../lib/today";

const byDue = (a: Occurrence, b: Occurrence) => a.dueAt.localeCompare(b.dueAt);
const dueDay = (o: Occurrence) => localDateOf(new Date(o.dueAt));

export function TodayPage({ selected, renderTask }: { selected?: string; renderTask?(id: string, close: () => void): ReactNode }) {
  const { me, isDom, solo, features, rel, memberName } = useRel();
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
  // Whoever has tasks of their own is led by the next one, which then leaves the list below.
  const next = useMemo(() => (occ.data ? pickNext(groups.today, me.user.id) : undefined), [occ.data, groups.today, me.user.id]);
  const restOfToday = (isDom ? groups.today.filter((o) => !decided.has(o.id)) : groups.today).filter((o) => o.id !== next?.id);
  const todays = groups.today.filter((o) => o.status !== "excused");
  const doneToday = todays.filter((o) => o.status === "completed" || o.status === "submitted").length;
  const partner = rel.members.find((m) => m.userId !== me.user.id);
  const wide = useMediaQuery(WIDE);
  const part = dayPart(new Date().getHours());
  const weekday = fmtDate(t, { weekday: "long" });
  const tonight = part === "evening" || part === "night" ? "tonight" : "today";
  const myLeft = groups.today.filter((o) => o.status === "pending" && o.assigneeId === me.user.id).length;
  const theirLeft = groups.today.filter((o) => o.status === "pending" && o.assigneeId !== me.user.id).length;
  // One line under the greeting: what's waiting, then what's left of the day.
  const summary = !occ.data
    ? undefined
    : isDom && !solo
      ? [
          needs.count > 0 ? `${cap(count(needs.count))} ${needs.count === 1 ? "thing is" : "things are"} waiting on you.` : null,
          theirLeft > 0
            ? `${partner ? memberName(partner.userId) : "They"} ${theirLeft === 1 ? "has one" : `has ${count(theirLeft)}`} left ${tonight}.`
            : needs.count > 0
              ? "After that, nothing until tomorrow."
              : "Nothing else until tomorrow.",
        ]
          .filter(Boolean)
          .join(" ")
      : todays.length === 0
        ? "Nothing due today."
        : myLeft === 0
          ? "All done for today."
          : `${cap(count(myLeft))} left ${tonight}.`;
  const newTask = () => navigate({ to: "/tasks/$taskId", params: { taskId: "new" } });
  useRowShortcuts(isDom ? newTask : undefined);

  return (
    <RowLink.Provider value={wide ? (id) => ({ to: "/", search: { task: id }, current: id === selected }) : null}>
      <div className="xl:flex xl:items-start">
        <div className="min-w-0 flex-1 xl:mx-auto xl:max-w-4xl">
          <PageHeader
            actions={
              wide && isDom ? (
                <Button variant="tonal" icon="add" onClick={newTask}>
                  New task
                </Button>
              ) : undefined
            }
            hero
            title={isDom && !solo ? `Good ${part === "night" ? "evening" : part}${name ? `, ${name}` : ""}.` : `${weekday} ${part}.`}
            subtitle={summary}
          />
          {/* The Next block counts down on its own, so the separate countdown is only for what it doesn't cover. */}
          <CountdownCard skip={next?.id} />
          <RoleSwapCard />
          <SoloCards />
          <ChastityToday />
          <CurfewStrip />
          <SceneCards />
          {next && <NextUp o={next} />}
          <KitPrompt />
          {isDom && <TodayInbox />}
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
                title={
                  isDom && !solo && partner
                    ? `${memberName(partner.userId)}'s ${part === "night" ? "evening" : part}`
                    : next
                      ? `Later ${tonight}`
                      : "Today"
                }
                action={
                  myOpenToday.length > 1 ? (
                    <Button variant="text" icon="more_time" onClick={() => setDaySheet(true)}>
                      More time
                    </Button>
                  ) : isDom && !solo && todays.length > 0 ? (
                    <span className="text-body-small text-on-surface-variant tabular-nums">
                      {doneToday} of {todays.length}
                    </span>
                  ) : undefined
                }
              >
                {isDom && !solo && todays.length > 0 && <Segments done={doneToday} total={todays.length} />}
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
              {!isDom && <TodayInbox />}
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
          {/* On phones the + in the tab bar starts a task. */}
          {isDom && <Fab icon="add" label="New task" onClick={newTask} className="max-md:hidden xl:hidden" />}
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

/** The part of the day a greeting names. */
function dayPart(hour: number) {
  return hour < 5 ? "night" : hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 22 ? "evening" : "night";
}

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const count = (n: number) => WORDS[n] ?? String(n);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The partner's day as short bars, one per task, done ones in ink. */
function Segments({ done, total }: { done: number; total: number }) {
  return (
    <div className="mb-2 flex gap-1.5" aria-hidden>
      {Array.from({ length: Math.min(total, 12) }, (_, i) => (
        <span key={i} className={i < Math.round((done / total) * Math.min(total, 12)) ? "h-[3px] flex-1 bg-on-surface" : "h-[3px] flex-1 bg-outline-variant"} />
      ))}
    </div>
  );
}

/** With no task selected, the side panel shows the day at a glance and points toward the next reward. */
function Glance({ today: list, done }: { today: Occurrence[]; done: number }) {
  const { rel, me, isDom, solo, features, memberName } = useRel();
  const balances = useBalances(rel.id);
  const rewards = useLibrary(rel.id, "rewards", features.points);
  const earner = isDom && !solo ? rel.members.find((m) => m.userId !== me.user.id)?.userId : me.user.id;
  const balance = balances.data?.find((b) => b.userId === earner)?.balance ?? 0;
  const next = (rewards.data ?? []).filter((r) => r.cost > balance).sort((a, b) => a.cost - b.cost)[0];
  return (
    <div className="flex flex-col gap-4 p-6">
      <h2 className="text-title-large text-on-surface">At a glance</h2>
      {list.length > 0 ? <Progress today={list} done={done} points={features.points} /> : <p className="text-body-medium text-on-surface-variant">Nothing due today.</p>}
      {features.points && earner && (
        <div className="rounded-lg bg-surface p-4">
          <div className="text-title-small text-on-surface-variant">{isDom && !solo ? `${memberName(earner)}'s points` : "Your points"}</div>
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
function Progress({ today: list, done, points, showNext = true }: { today: Occurrence[]; done: number; points: boolean; showNext?: boolean }) {
  const now = Date.now();
  const open = list.filter((o) => o.status === "pending");
  const next = open.find((o) => new Date(o.dueAt).getTime() >= now);
  const left = open.reduce((sum, o) => sum + Math.max(0, o.points), 0);
  const frac = list.length ? done / list.length : 0;
  return (
    <div className="mx-4 mb-6 md:mx-6">
      <div className="flex items-baseline justify-between gap-3">
        <div className="font-serif text-[26px] leading-8 text-on-surface">{done === list.length ? "All done for today" : `${done} of ${list.length} done`}</div>
        {points && left > 0 && <div className="shrink-0 text-body-small text-outline tabular-nums">{left} pts left</div>}
      </div>
      {/* A thin line, not a ring: progress is a glance, not the point. */}
      <div className="mt-2 h-0.5 bg-outline-variant" aria-hidden>
        <div className="h-full bg-on-surface transition-[width]" style={{ width: `${frac * 100}%` }} />
      </div>
      {showNext && (next || open.length > 0) && (
        <div className="mt-2 text-body-medium text-on-surface-variant">
          {next ? (
            <>
              Next: <span className="text-on-surface">{next.title}</span> {fmtRelative(next.dueAt)}
            </>
          ) : (
            `${open.length} still open`
          )}
        </div>
      )}
    </div>
  );
}

/** A later day, collapsed to its task names until opened. */
function LaterDay({ day, items }: { day: string; items: Occurrence[] }) {
  const [open, setOpen] = useState(false);
  const label = day === addDays(today(), 1) ? "Tomorrow" : fmtDate(day, { weekday: "long", month: "short", day: "numeric" });
  return (
    <div className="border-b border-outline-variant">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="state-layer flex w-full items-center gap-3 py-3 text-left">
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
