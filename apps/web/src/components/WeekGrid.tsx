import { useEffect, useMemo, useRef, useState } from "react";
import type { CalendarEvent, Occurrence } from "../api/types";
import { fmtDate, fmtTime, isAllDayDue, localDateOf, today } from "../lib/dates";
import { useRel } from "../lib/relationship";
import { planTone } from "../lib/planColors";
import { Icon, cx } from "./ui";

const HOUR = 48; // px per hour
const MIN_BLOCK = 24; // px, so a task or a short plan stays tappable

/** All-day plans, and plans of a day or more, go in the strip above the hours, like any calendar. */
export const inTopStrip = (e: CalendarEvent) => e.allDay || new Date(e.endsAt).getTime() - new Date(e.startsAt).getTime() >= 86_400_000;

const dayStart = (d: string) => new Date(`${d}T00:00`).getTime();

type Block = { key: string; start: number; end: number; kind: "event"; e: CalendarEvent } | { key: string; start: number; end: number; kind: "task"; o: Occurrence };

/** Side-by-side lanes for overlapping blocks within one day: each block gets its lane and how many share its cluster. */
function lanes(blocks: Block[]) {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: { b: Block; lane: number; of: number }[] = [];
  let cluster: { b: Block; lane: number; of: number }[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    const n = Math.max(0, ...cluster.map((c) => c.lane)) + 1;
    for (const c of cluster) c.of = n;
    out.push(...cluster);
    cluster = [];
  };
  for (const b of sorted) {
    if (b.start >= clusterEnd && cluster.length) flush();
    const taken = new Set(cluster.filter((c) => c.b.end > b.start).map((c) => c.lane));
    let lane = 0;
    while (taken.has(lane)) lane++;
    cluster.push({ b, lane, of: 1 });
    clusterEnd = Math.max(clusterEnd, b.end);
  }
  if (cluster.length) flush();
  return out;
}

/** Bars spanning the days they cover, stacked into rows, for the strip above the hours. */
function stripRows(days: string[], events: CalendarEvent[], allDayTasks: Occurrence[]) {
  type Bar = { key: string; from: number; to: number; e?: CalendarEvent; o?: Occurrence };
  const bars: Bar[] = [];
  for (const e of events) {
    const first = localDateOf(new Date(e.startsAt));
    const last = localDateOf(new Date(new Date(e.endsAt).getTime() - 1));
    const from = days.findIndex((d) => d >= first);
    const to = days.length - 1 - [...days].reverse().findIndex((d) => d <= last);
    if (from === -1 || to < from || to >= days.length) continue;
    bars.push({ key: e.id, from, to, e });
  }
  for (const o of allDayTasks) {
    const i = days.indexOf(localDateOf(new Date(o.dueAt)));
    if (i >= 0) bars.push({ key: o.id, from: i, to: i, o });
  }
  // Longer bars first, so multi-day plans sit on top and single-day items fill in below.
  bars.sort((a, b) => a.from - b.from || b.to - b.from - (a.to - a.from));
  const rows: Bar[][] = [];
  for (const bar of bars) {
    const row = rows.find((r) => r.every((x) => x.to < bar.from || x.from > bar.to));
    if (row) row.push(bar);
    else rows.push([bar]);
  }
  return rows.flatMap((r, i) => r.map((bar) => ({ ...bar, row: i })));
}

function dot(o: Occurrence) {
  if (o.status === "completed") return "bg-primary";
  if (o.status === "missed" || (o.status === "pending" && new Date(o.dueAt).getTime() < Date.now())) return "bg-error";
  if (o.status === "submitted") return "bg-tertiary";
  if (o.status === "excused") return "bg-outline";
  return "border-[1.5px] border-on-surface-variant";
}

/**
 * The desktop week: an all-day strip across the top and an hourly grid below, with plans as blocks from start to end
 * and tasks pinned at their due time.
 */
export function WeekGrid({
  days,
  occurrences,
  events,
  clashing,
  onOpenTask,
  onOpenEvent,
  fab,
}: {
  days: string[];
  occurrences: Occurrence[];
  events: CalendarEvent[];
  clashing: Set<string>;
  onOpenTask(o: Occurrence): void;
  onOpenEvent(e: CalendarEvent): void;
  /** A floating button sits in the bottom corner: the grid stops above it, so its scrollbar doesn't run under the button. */
  fab?: boolean;
}) {
  const t = today();
  const { rel } = useRel();
  const scroller = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const strip = useMemo(
    () =>
      stripRows(
        days,
        events.filter(inTopStrip),
        occurrences.filter((o) => isAllDayDue(o.dueAt)),
      ),
    [days, events, occurrences],
  );
  const stripHeight = strip.length ? Math.max(...strip.map((b) => b.row)) + 1 : 0;

  const perDay = useMemo(
    () =>
      days.map((d) => {
        const from = dayStart(d);
        const to = from + 86_400_000;
        const blocks: Block[] = [];
        for (const e of events) {
          if (inTopStrip(e)) continue;
          const s = Math.max(new Date(e.startsAt).getTime(), from);
          const en = Math.min(new Date(e.endsAt).getTime(), to);
          if (en > s) blocks.push({ key: `${e.id}-${d}`, start: s - from, end: en - from, kind: "event", e });
        }
        for (const o of occurrences) {
          if (isAllDayDue(o.dueAt) || localDateOf(new Date(o.dueAt)) !== d) continue;
          const s = new Date(o.dueAt).getTime() - from;
          blocks.push({ key: o.id, start: s, end: s + 30 * 60_000, kind: "task", o });
        }
        return lanes(blocks);
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
    <div className="mx-6 overflow-hidden rounded-lg bg-surface-container-low">
      {/* Day headings; every row keeps room for the hours' scrollbar, so the columns line up. */}
      <div className="grid grid-cols-[64px_repeat(7,1fr)] overflow-y-hidden border-b border-outline-variant [scrollbar-gutter:stable]">
        <div />
        {days.map((d) => (
          <div key={d} className="flex items-baseline gap-2 px-2 py-2">
            <span className="text-label-medium text-on-surface-variant">{fmtDate(d, { weekday: "short" })}</span>
            <span className={cx("flex size-8 items-center justify-center rounded-full text-title-medium", d === t ? "bg-primary text-on-primary" : "text-on-surface")}>
              {Number(d.slice(8))}
            </span>
          </div>
        ))}
      </div>

      {/* All-day strip */}
      {stripHeight > 0 && (
        <div className="grid grid-cols-[64px_repeat(7,1fr)] overflow-y-hidden border-b border-outline-variant py-1 [scrollbar-gutter:stable]">
          <div className="px-2 pt-1 text-right text-label-small text-on-surface-variant">All day</div>
          <div className="col-span-7 grid grid-cols-7 gap-y-1" style={{ gridTemplateRows: `repeat(${stripHeight}, 26px)` }}>
            {strip.map((bar) =>
              bar.e ? (
                <button
                  key={bar.key}
                  type="button"
                  onClick={() => onOpenEvent(bar.e!)}
                  style={{ gridColumn: `${bar.from + 1} / ${bar.to + 2}`, gridRow: bar.row + 1 }}
                  className={cx("state-layer mx-1 flex min-w-0 items-center gap-1 rounded-sm px-2 text-left text-label-large", planTone(bar.e, rel).bg, planTone(bar.e, rel).text)}
                >
                  <Icon name="event" size={16} className="shrink-0" />
                  <span className="truncate">{bar.e.title}</span>
                  {bar.e.conflictIds.length > 0 && <Icon name="warning" size={14} className="ml-auto shrink-0" />}
                </button>
              ) : (
                <button
                  key={bar.key}
                  type="button"
                  onClick={() => onOpenTask(bar.o!)}
                  style={{ gridColumn: `${bar.from + 1} / ${bar.from + 2}`, gridRow: bar.row + 1 }}
                  className="state-layer mx-1 flex min-w-0 items-center gap-1.5 rounded-sm bg-surface px-2 text-left text-label-large text-on-surface"
                >
                  <span className={cx("size-2 shrink-0 rounded-full", dot(bar.o!))} />
                  <span className={cx("truncate", bar.o!.status === "completed" && "line-through opacity-70")}>{bar.o!.title}</span>
                </button>
              ),
            )}
          </div>
        </div>
      )}

      {/* Hours */}
      <div ref={scroller} className={cx("max-h-[calc(100dvh-290px)] min-h-96 overflow-y-auto [scrollbar-gutter:stable]", fab && "md:max-h-[calc(100dvh-370px)]")}>
        <div className="relative grid grid-cols-[64px_repeat(7,1fr)]" style={{ height: 24 * HOUR }}>
          <div className="relative">
            {Array.from({ length: 23 }, (_, h) => (
              <span key={h} className="absolute right-2 -translate-y-1/2 text-label-small text-on-surface-variant" style={{ top: (h + 1) * HOUR }}>
                {new Date(2000, 0, 1, h + 1).toLocaleTimeString(undefined, { hour: "numeric" })}
              </span>
            ))}
          </div>
          {days.map((d, i) => (
            <div key={d} className={cx("relative border-l border-outline-variant", d === t && "bg-secondary-container/30")}>
              {Array.from({ length: 23 }, (_, h) => (
                <div key={h} className="absolute inset-x-0 border-t border-outline-variant/60" style={{ top: (h + 1) * HOUR }} />
              ))}
              {perDay[i]!.map(({ b, lane, of }) => {
                const top = (b.start / 3_600_000) * HOUR;
                const height = Math.max(MIN_BLOCK, ((b.end - b.start) / 3_600_000) * HOUR - 2);
                const style = { top, height, left: `calc(${(lane / of) * 100}% + 2px)`, width: `calc(${100 / of}% - 4px)` };
                return b.kind === "event" ? (
                  <button
                    key={b.key}
                    type="button"
                    onClick={() => onOpenEvent(b.e)}
                    style={style}
                    className={cx("state-layer absolute z-10 flex flex-col overflow-hidden rounded-sm px-2 py-1 text-left", planTone(b.e, rel).bg, planTone(b.e, rel).text)}
                  >
                    <span className="truncate text-label-large">{b.e.title}</span>
                    {height > 40 && (
                      <span className="truncate text-label-small opacity-80">
                        {fmtTime(b.e.startsAt)} – {fmtTime(b.e.endsAt)}
                      </span>
                    )}
                  </button>
                ) : (
                  <button
                    key={b.key}
                    type="button"
                    onClick={() => onOpenTask(b.o)}
                    style={{ ...style, height: MIN_BLOCK }}
                    className={cx(
                      "state-layer absolute z-20 flex items-center gap-1.5 overflow-hidden rounded-sm border px-2 text-left text-label-medium shadow-elev-1",
                      clashing.has(b.o.id) ? "border-error bg-error-container text-on-error-container" : "border-outline-variant bg-surface text-on-surface",
                    )}
                  >
                    <span className={cx("size-2 shrink-0 rounded-full", dot(b.o))} />
                    <span className={cx("truncate", b.o.status === "completed" && "line-through opacity-70")}>
                      {fmtTime(b.o.dueAt)} {b.o.title}
                    </span>
                  </button>
                );
              })}
              {d === t && (
                <div className="pointer-events-none absolute inset-x-0 z-30 h-0.5 bg-error" style={{ top: ((now - dayStart(d)) / 3_600_000) * HOUR }}>
                  <span className="absolute -top-[5px] -left-[5px] size-3 rounded-full bg-error" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The desktop month: each week a row of days, with all-day and multi-day plans as bars across the days they cover
 * and up to three timed items per day underneath.
 */
export function MonthWeeks({
  days,
  month,
  selected,
  occurrences,
  events,
  onSelect,
  onOpenEvent,
}: {
  days: string[];
  month: string;
  selected: string;
  occurrences: Occurrence[];
  events: CalendarEvent[];
  onSelect(d: string): void;
  onOpenEvent(e: CalendarEvent): void;
}) {
  const t = today();
  const { rel } = useRel();
  const weeks = Array.from({ length: days.length / 7 }, (_, i) => days.slice(i * 7, i * 7 + 7));
  const long = events.filter(inTopStrip);
  return (
    <div className="flex flex-col gap-px overflow-hidden rounded-lg bg-outline-variant">
      {weeks.map((week) => {
        const bars = stripRows(week, long, []);
        const rows = bars.length ? Math.max(...bars.map((b) => b.row)) + 1 : 0;
        return (
          <div key={week[0]} className="grid min-h-28 grid-cols-7 gap-x-px" style={{ gridTemplateRows: `32px ${rows ? `repeat(${rows}, 24px) ` : ""}1fr` }}>
            {week.map((d, i) => (
              <button
                key={d}
                type="button"
                aria-label={fmtDate(d, { weekday: "long", month: "long", day: "numeric" })}
                onClick={() => onSelect(d)}
                style={{ gridColumn: i + 1, gridRow: "1 / -1" }}
                className={cx("state-layer", selected === d ? "bg-secondary-container" : d.startsWith(month) ? "bg-surface-container-low" : "bg-surface")}
              />
            ))}
            {week.map((d, i) => (
              <span
                key={`n-${d}`}
                style={{ gridColumn: i + 1, gridRow: 1 }}
                className={cx(
                  "pointer-events-none relative z-10 m-1 flex size-7 items-center justify-center rounded-full text-label-large",
                  d === t ? "bg-primary text-on-primary" : d.startsWith(month) ? "text-on-surface" : "text-on-surface-variant/60",
                )}
              >
                {Number(d.slice(8))}
              </span>
            ))}
            {bars.map((bar) => (
              <button
                key={`${bar.key}-${week[0]}`}
                type="button"
                onClick={() => onOpenEvent(bar.e!)}
                style={{ gridColumn: `${bar.from + 1} / ${bar.to + 2}`, gridRow: bar.row + 2 }}
                className={cx(
                  "state-layer relative z-10 mx-1 my-0.5 flex min-w-0 items-center gap-1 rounded-xs px-1.5 text-left text-label-medium",
                  planTone(bar.e!, rel).bg,
                  planTone(bar.e!, rel).text,
                )}
              >
                <span className="truncate">{bar.e!.title}</span>
              </button>
            ))}
            {week.map((d, i) => {
              const timed = events.filter((e) => !inTopStrip(e) && localDateOf(new Date(e.startsAt)) === d);
              const tasks = occurrences.filter((o) => localDateOf(new Date(o.dueAt)) === d);
              const shown = 3;
              return (
                <span
                  key={`l-${d}`}
                  style={{ gridColumn: i + 1, gridRow: rows + 2 }}
                  className="pointer-events-none relative z-10 flex min-w-0 flex-col gap-0.5 px-1.5 pt-0.5 pb-1.5"
                >
                  {timed.slice(0, shown).map((e) => (
                    <span key={e.id} className={cx("truncate rounded-xs px-1 text-label-small", planTone(e, rel).bg, planTone(e, rel).text)}>
                      {fmtTime(e.startsAt)} {e.title}
                    </span>
                  ))}
                  {tasks.slice(0, Math.max(0, shown - timed.length)).map((o) => (
                    <span key={o.id} className="flex items-center gap-1 truncate text-label-small text-on-surface-variant">
                      <span className={cx("size-1.5 shrink-0 rounded-full", dot(o))} />
                      <span className="truncate">{o.title}</span>
                    </span>
                  ))}
                  {timed.length + tasks.length > shown && <span className="text-label-small text-primary">+{timed.length + tasks.length - shown} more</span>}
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
