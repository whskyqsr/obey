import { useEffect, useMemo, useRef, useState } from "react";
import type { CalendarEvent, Occurrence } from "../api/types";
import { fmtDate, fmtTime, isAllDayDue, localDateOf, today } from "../lib/dates";
import { useRel } from "../lib/relationship";
import { planPeople } from "../lib/planColors";
import { isOverdue } from "./OccurrenceCard";
import { Diamond, type DiamondState, cx } from "./ui";

const HOUR = 48; // px per hour
const MIN_BLOCK = 24; // px, so a task or a short plan stays tappable
const LABEL = 26; // px per all-day label row

/** All-day plans, and plans of a day or more, shade the days they cover instead of sitting in the hours. */
export const coversDays = (e: CalendarEvent) => e.allDay || new Date(e.endsAt).getTime() - new Date(e.startsAt).getTime() >= 86_400_000;

const dayStart = (d: string) => new Date(`${d}T00:00`).getTime();

type Block = { key: string; start: number; end: number; kind: "event"; e: CalendarEvent } | { key: string; start: number; end: number; kind: "task"; o: Occurrence };

/** Side-by-side lanes for overlapping blocks within one day: each block gets its lane and how many share its cluster. */
function lanes(blocks: Block[]) {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: { b: Block; lane: number; of: number }[] = [];
  let cluster: typeof out = [];
  let clusterEnd = -1;
  const flush = () => {
    const n = Math.max(0, ...cluster.map((c) => c.lane)) + 1;
    for (const c of cluster) c.of = n;
    out.push(...cluster);
    cluster = [];
  };
  for (const b of sorted) {
    if (b.start >= clusterEnd) flush();
    const taken = new Set(cluster.filter((c) => c.b.end > b.start).map((c) => c.lane));
    let lane = 0;
    while (taken.has(lane)) lane++;
    cluster.push({ b, lane, of: 1 });
    clusterEnd = Math.max(clusterEnd, b.end);
  }
  flush();
  return out;
}

/** Each day-covering plan's first and last visible day, packed into as few label rows as fit. */
function spans(days: string[], events: CalendarEvent[]) {
  const ends: number[] = [];
  return events
    .map((e) => {
      const first = localDateOf(new Date(e.startsAt));
      const last = localDateOf(new Date(new Date(e.endsAt).getTime() - 1));
      const from = days.findIndex((d) => d >= first);
      const to = days.length - 1 - [...days].reverse().findIndex((d) => d <= last);
      return { e, from, to, before: first < days[0]!, after: last > days[days.length - 1]! };
    })
    .filter((s) => s.from >= 0 && s.to >= s.from && s.from < days.length)
    .sort((a, b) => a.from - b.from || b.to - b.from - (a.to - a.from))
    .map((s) => {
      let row = ends.findIndex((end) => end < s.from);
      if (row < 0) row = ends.push(-1) - 1;
      ends[row] = s.to;
      return { ...s, row };
    });
}

function taskState(o: Occurrence): DiamondState {
  if (o.status === "completed") return "done";
  if (o.status === "missed" || isOverdue(o)) return "owed";
  if (o.status === "submitted") return "waiting";
  if (o.status === "excused") return "off";
  return "open";
}

/**
 * The desktop week: an hourly grid with a column per day. Tasks sit at their due time and timed plans run from start to
 * end. A plan that covers whole days shades those days, with its name once over the first. A task that runs into a plan
 * is marked until someone sorts it out (moves it, or keeps it as it is).
 */
export function WeekGrid({
  days,
  occurrences,
  events,
  clashing,
  onOpenTask,
  onOpenEvent,
}: {
  days: string[];
  occurrences: Occurrence[];
  events: CalendarEvent[];
  clashing: Set<string>;
  onOpenTask(o: Occurrence): void;
  onOpenEvent(e: CalendarEvent): void;
}) {
  const t = today();
  const { rel, me } = useRel();
  const scroller = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const whose = (e: CalendarEvent) =>
    e.withPartner || planPeople(rel).length < 2
      ? null
      : e.authorId === me.user.id
        ? "You"
        : (rel.members.find((m) => m.userId === e.authorId)?.displayName ?? null);

  const long = useMemo(() => spans(days, events.filter(coversDays)), [days, events]);
  const labelRows = long.length ? Math.max(...long.map((s) => s.row)) + 1 : 0;
  const allDayTasks = useMemo(() => days.map((d) => occurrences.filter((o) => isAllDayDue(o.dueAt) && localDateOf(new Date(o.dueAt)) === d)), [days, occurrences]);

  const perDay = useMemo(
    () =>
      days.map((d) => {
        const from = dayStart(d);
        const to = from + 86_400_000;
        const blocks: Block[] = [];
        for (const e of events) {
          if (coversDays(e)) continue;
          const s = Math.max(new Date(e.startsAt).getTime(), from);
          const en = Math.min(new Date(e.endsAt).getTime(), to);
          if (en > s) blocks.push({ key: `${e.id}-${d}`, start: s - from, end: en - from, kind: "event", e });
        }
        for (const o of occurrences) {
          if (isAllDayDue(o.dueAt) || localDateOf(new Date(o.dueAt)) !== d) continue;
          const s = new Date(o.dueAt).getTime() - from;
          blocks.push({ key: o.id, start: s, end: s + 30 * 60_000, kind: "task", o });
        }
        // Plans and tasks lay out separately: tasks sit over the plan they fall in, inset so its rule still shows.
        return [...lanes(blocks.filter((b) => b.kind === "event")), ...lanes(blocks.filter((b) => b.kind === "task"))];
      }),
    [days, events, occurrences],
  );

  // Open on the morning, or earlier if something is on before then.
  useEffect(() => {
    const earliest = Math.min(8 * 60, ...perDay.flat().map((x) => x.b.start / 60_000));
    scroller.current?.scrollTo({ top: Math.max(0, (earliest / 60 - 1) * HOUR) });
    // Only when the week changes, not on every refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days[0]]);

  return (
    <div className="mx-6 border-y border-outline-variant">
      <div ref={scroller} className="max-h-[calc(100dvh-190px)] min-h-96 overflow-y-auto">
        {/* Day headings stay put while the hours scroll. */}
        <div className="sticky top-0 z-40 grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-outline-variant bg-background">
          <div />
          {days.map((d) => (
            <div key={d} className={cx("flex h-[68px] flex-col border-l border-outline-variant px-3 pt-3", d === t && "bg-surface-container-lowest")}>
              <span className={cx("text-label-medium", d === t ? "text-primary" : "text-on-surface-variant")}>{fmtDate(d, { weekday: "short" })}</span>
              <span className="font-serif text-[30px] leading-8 text-on-surface">{Number(d.slice(8))}</span>
            </div>
          ))}
        </div>
        <div className="relative grid grid-cols-[56px_repeat(7,minmax(0,1fr))]" style={{ height: 24 * HOUR }}>
          <div className="relative">
            {Array.from({ length: 23 }, (_, h) => (
              <span key={h} className="absolute right-2 -translate-y-1/2 text-label-small text-on-surface-variant" style={{ top: (h + 1) * HOUR }}>
                {new Date(2000, 0, 1, h + 1).toLocaleTimeString(undefined, { hour: "numeric" })}
              </span>
            ))}
          </div>
          {days.map((d, i) => {
            const shaded = long.some((s) => s.from <= i && s.to >= i);
            const starting = long.filter((s) => s.from === i);
            return (
              <div key={d} className={cx("relative border-l border-outline-variant", d === t && "bg-surface-container-lowest")}>
                {shaded && <div aria-hidden className="absolute inset-0 bg-primary-container/35" />}
                {Array.from({ length: 23 }, (_, h) => (
                  <div key={h} className="absolute inset-x-0 border-t border-outline-variant/60" style={{ top: (h + 1) * HOUR }} />
                ))}
                {/* Names of the plans that shade these days, once over their first day, then the day's untimed tasks. They
                    stay in view while the hours scroll under them. */}
                {(labelRows > 0 || allDayTasks[i]!.length > 0) && (
                  <div className="pointer-events-none sticky top-[69px] z-30 flex flex-col gap-0.5 pt-1">
                    {Array.from({ length: labelRows }, (_, r) => {
                      const s = starting.find((x) => x.row === r);
                      if (!s) return <div key={r} style={{ height: LABEL }} />;
                      const meta = [s.e.allDay ? null : `${fmtTime(s.e.startsAt)}–${fmtTime(s.e.endsAt)}`, whose(s.e)].filter(Boolean).join(" · ");
                      return (
                        <button
                          key={r}
                          type="button"
                          onClick={() => onOpenEvent(s.e)}
                          style={{ height: LABEL, width: `calc(${s.to - s.from + 1} * 100% + ${s.to - s.from}px - 8px)` }}
                          className={cx(
                            "state-layer pointer-events-auto relative mx-1 flex min-w-0 items-center gap-2 bg-surface/80 px-2 text-left backdrop-blur-sm",
                            !s.before && "border-l-2 border-primary",
                          )}
                        >
                          {s.before && <span className="text-label-small text-on-surface-variant">‹</span>}
                          <span className="max-w-full shrink-0 truncate text-body-small text-on-surface">{s.e.title}</span>
                          {meta && <span className="min-w-0 truncate text-label-small text-on-surface-variant">{meta}</span>}
                          {s.after && <span className="ml-auto text-label-small text-on-surface-variant">›</span>}
                        </button>
                      );
                    })}
                    {allDayTasks[i]!.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => onOpenTask(o)}
                        className={cx(
                          "state-layer pointer-events-auto mx-1 flex min-w-0 items-center gap-1.5 bg-surface/80 px-2 py-0.5 text-left backdrop-blur-sm",
                          clashing.has(o.id) && "border-l-2 border-error",
                        )}
                      >
                        <Diamond state={taskState(o)} size={10} className="shrink-0" />
                        <span className={cx("truncate text-body-small", clashing.has(o.id) ? "text-error" : "text-on-surface")}>{o.title}</span>
                      </button>
                    ))}
                  </div>
                )}
                {perDay[i]!.map(({ b, lane, of }) => {
                  const top = (b.start / 3_600_000) * HOUR;
                  const height = Math.max(MIN_BLOCK, ((b.end - b.start) / 3_600_000) * HOUR - 2);
                  const inset = b.kind === "task" && perDay[i]!.some((x) => x.b.kind === "event" && x.b.start <= b.start && x.b.end > b.start) ? 14 : 4;
                  const style = { top, height, left: `calc(${(lane / of) * 100}% + ${inset}px)`, width: `calc(${100 / of}% - ${inset + 4}px)` };
                  if (b.kind === "event") {
                    // The hours already show when it runs; only whose it is.
                    const meta = whose(b.e);
                    return (
                      <button
                        key={b.key}
                        type="button"
                        onClick={() => onOpenEvent(b.e)}
                        style={style}
                        className="state-layer absolute z-10 flex flex-col overflow-hidden border-l-2 border-primary bg-primary-container/50 px-2 py-1 text-left"
                      >
                        <span className="truncate text-body-small text-on-surface">{b.e.title}</span>
                        {meta && height > 40 && <span className="truncate text-label-small text-on-surface-variant">{meta}</span>}
                      </button>
                    );
                  }
                  const clash = clashing.has(b.o.id);
                  const state = taskState(b.o);
                  return (
                    <button
                      key={b.key}
                      type="button"
                      onClick={() => onOpenTask(b.o)}
                      title={clash ? "Runs into a plan" : undefined}
                      style={{ ...style, height: MIN_BLOCK }}
                      className={cx(
                        "state-layer absolute z-20 flex items-center gap-1.5 overflow-hidden bg-surface px-1.5 text-left",
                        clash ? "border border-error" : "border border-outline-variant",
                      )}
                    >
                      <Diamond state={state} size={10} className="shrink-0" />
                      <span
                        className={cx(
                          "truncate text-body-small",
                          clash ? "text-error" : state === "done" || state === "off" ? "text-on-surface-variant" : "text-on-surface",
                        )}
                      >
                        {b.o.title}
                      </span>
                    </button>
                  );
                })}
                {d === t && (
                  <div className="pointer-events-none absolute inset-x-0 z-30 h-px bg-primary" style={{ top: ((now - dayStart(d)) / 3_600_000) * HOUR }}>
                    <span className="absolute -top-[4px] -left-[4px] size-2 rotate-45 bg-primary" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
