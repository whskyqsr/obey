import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AiAccessAsk } from "../components/AiAccessAsk";
import { useNavigate } from "@tanstack/react-router";
import { usePendingReschedules } from "../api/hooks";
import type { Occurrence } from "../api/types";
import { DayRescheduleSheet, WholeDayContext } from "../components/DayRescheduleSheet";
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
import { PartnerColumn } from "../components/PartnerColumn";
import { KitPrompt } from "./Kits";
import { Button, Empty, ErrorBox, Fab, Icon, Loading, PageHeader, Section } from "../components/ui";
import { addDays, fmtDate, localDateOf, today } from "../lib/dates";
import { useRel } from "../lib/relationship";
import { WIDE, useMediaQuery } from "../lib/useMediaQuery";
import { useNeedsYou, useTodayOccurrences } from "../lib/today";

const byDue = (a: Occurrence, b: Occurrence) => a.dueAt.localeCompare(b.dueAt);
const dueDay = (o: Occurrence) => localDateOf(new Date(o.dueAt));

export function TodayPage({ selected, renderTask }: { selected?: string; renderTask?(id: string, close: () => void): ReactNode }) {
  const { me, isDom, solo, rel, memberName } = useRel();
  const navigate = useNavigate();
  const t = today();
  const occ = useTodayOccurrences();
  const needs = useNeedsYou();

  const groups = useMemo(() => {
    const list = (occ.data ?? []).filter((o) => o.status !== "cancelled");
    const now = Date.now();
    const later = new Map<string, Occurrence[]>();
    for (const o of list.filter((o) => dueDay(o) > t && o.status === "pending").sort(byDue))
      later.set(dueDay(o), [...(later.get(dueDay(o)) ?? []), o]);
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
  const openDaySheet = useCallback(() => setDaySheet(true), []);
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
  // "two tasks", "one task": the noun stays, so the line reads as a sentence.
  const tasks = (n: number) => `${count(n)} ${n === 1 ? "task" : "tasks"}`;
  const myLeft = groups.today.filter((o) => o.status === "pending" && o.assigneeId === me.user.id).length;
  const theirLeft = groups.today.filter((o) => o.status === "pending" && o.assigneeId !== me.user.id).length;
  // One line under the greeting: what's waiting, then what's left of the day.
  const summary = !occ.data
    ? undefined
    : isDom && !solo
      ? [
          needs.count > 0 ? `${cap(count(needs.count))} ${needs.count === 1 ? "thing is" : "things are"} waiting on you.` : null,
          theirLeft > 0
            ? `${partner ? memberName(partner.userId) : "They"} has ${tasks(theirLeft)} left ${tonight}.`
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
          : `${cap(tasks(myLeft))} left ${tonight}.`;
  const newTask = () => navigate({ to: "/tasks/$taskId", params: { taskId: "new" } });
  useRowShortcuts(isDom ? newTask : undefined);

  return (
    <WholeDayContext.Provider value={myOpenToday.length > 1 ? openDaySheet : null}>
      <RowLink.Provider value={wide ? (id) => ({ to: "/", search: { task: id }, current: id === selected }) : null}>
        <div className="xl:flex xl:items-start">
          <div className="min-w-0 flex-1 xl:mx-auto xl:max-w-4xl">
            <PageHeader
              hero
              title={isDom && !solo ? `Good ${part === "night" ? "evening" : part}${name ? `, ${name}` : ""}.` : `${weekday} ${part}.`}
              subtitle={summary}
            />
            {/* The Next block counts down on its own, so the separate countdown is only for what it doesn't cover. */}
            <CountdownCard skip={next?.id} />
            <RoleSwapCard />
            <AiAccessAsk />
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
                      <button type="button" onClick={() => setDaySheet(true)} className="state-layer -mr-2 rounded-md px-2 py-1 text-body-medium text-primary">
                        More time for today
                      </button>
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
                      body={rel.endedAt ? "This dynamic has ended." : undefined}
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
            {isDom && <Fab icon="add" label="New task" onClick={newTask} className="max-md:hidden" />}
          </div>
          {wide && (
            <aside
              className="sticky top-0 h-dvh w-[400px] shrink-0 overflow-y-auto border-l border-outline-variant bg-surface-container-lowest"
              aria-label={selected ? "Task details" : "At a glance"}
            >
              {selected && renderTask ? renderTask(selected, () => navigate({ to: "/", search: {} })) : <PartnerColumn />}
            </aside>
          )}
        </div>
      </RowLink.Provider>
    </WholeDayContext.Provider>
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
        <span
          key={i}
          className={i < Math.round((done / total) * Math.min(total, 12)) ? "h-[3px] flex-1 bg-on-surface" : "h-[3px] flex-1 bg-outline-variant"}
        />
      ))}
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

/** A later day, collapsed to its task names until opened. */
function LaterDay({ day, items }: { day: string; items: Occurrence[] }) {
  const [open, setOpen] = useState(false);
  const label = day === addDays(today(), 1) ? "Tomorrow" : fmtDate(day, { weekday: "long", month: "short", day: "numeric" });
  return (
    <div className="border-b border-outline-variant">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="state-layer state-row flex w-full items-center gap-3 py-3 text-left">
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
