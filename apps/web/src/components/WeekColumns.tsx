import type { CalendarEvent, Occurrence } from "../api/types";
import { fmtDate, fmtTime, isAllDayDue, localDateOf, today } from "../lib/dates";
import { useRel } from "../lib/relationship";
import { planPeople, planTone } from "../lib/planColors";
import { isOverdue } from "./OccurrenceCard";
import { Diamond, type DiamondState, cx } from "./ui";

/** All-day plans, and plans of a day or more, run across the days they cover instead of sitting in a day's list. */
export const coversDays = (e: CalendarEvent) => e.allDay || new Date(e.endsAt).getTime() - new Date(e.startsAt).getTime() >= 86_400_000;

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
    .filter((s) => s.from >= 0 && s.to >= s.from)
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

/** "7–10:30 PM", or "11 AM–1 PM" across noon. */
function span(e: CalendarEvent) {
  const a = fmtTime(e.startsAt).replace(":00", "");
  const b = fmtTime(e.endsAt).replace(":00", "");
  const pa = a.slice(-2);
  return pa === b.slice(-2) ? `${a.slice(0, -3)}–${b}` : `${a}–${b}`;
}

type Entry = { at: number; kind: "task"; o: Occurrence } | { at: number; kind: "plan"; e: CalendarEvent; during: Occurrence[] };

/**
 * The desktop week: a column per day with its plans and tasks in the order they happen, without spacing out the gaps
 * between them. A timed plan holds the tasks that fall during it, so you can see what it runs into. A plan that covers
 * whole days is its name over a line that runs across those days. A task that runs into a plan is marked until someone
 * sorts it out (moves it, or keeps it as it is).
 */
export function WeekColumns({
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
  const whose = (e: CalendarEvent) =>
    e.withPartner || planPeople(rel).length < 2
      ? null
      : e.authorId === me.user.id
        ? "You"
        : (rel.members.find((m) => m.userId === e.authorId)?.displayName ?? null);

  const long = spans(days, events.filter(coversDays));
  const labelRows = long.length ? Math.max(...long.map((s) => s.row)) + 1 : 0;

  const columns = days.map((d) => {
    const tasks = occurrences.filter((o) => localDateOf(new Date(o.dueAt)) === d);
    const untimed = tasks.filter((o) => isAllDayDue(o.dueAt));
    const timed = tasks.filter((o) => !isAllDayDue(o.dueAt));
    const plans = events.filter((e) => !coversDays(e) && localDateOf(new Date(e.startsAt)) === d);
    const inside = new Set<string>();
    const entries: Entry[] = plans.map((e) => {
      const s = new Date(e.startsAt).getTime();
      const en = new Date(e.endsAt).getTime();
      const during = timed.filter((o) => {
        const at = new Date(o.dueAt).getTime();
        return at >= s && at < en && !inside.has(o.id);
      });
      for (const o of during) inside.add(o.id);
      return { at: s, kind: "plan", e, during };
    });
    for (const o of timed) if (!inside.has(o.id)) entries.push({ at: new Date(o.dueAt).getTime(), kind: "task", o });
    entries.sort((a, b) => a.at - b.at || (a.kind === "plan" ? -1 : 1));
    return { d, untimed, entries };
  });

  const task = (o: Occurrence) => {
    const clash = clashing.has(o.id);
    const state = taskState(o);
    return (
      <button
        key={o.id}
        type="button"
        onClick={() => onOpenTask(o)}
        title={isAllDayDue(o.dueAt) ? undefined : fmtTime(o.dueAt)}
        className="state-layer -mx-1 flex items-start gap-2 rounded-sm px-1 py-1 text-left"
      >
        <Diamond state={state} size={10} className="mt-1 shrink-0" />
        <span
          className={cx(
            "line-clamp-2 min-w-0 flex-1 text-body-small break-words",
            clash ? "text-error underline decoration-error/50 underline-offset-2" : state === "done" || state === "off" ? "text-on-surface-variant" : "text-on-surface",
          )}
        >
          {o.title}
        </span>
      </button>
    );
  };

  return (
    <div className="mx-6 grid grid-cols-7 border-y border-outline-variant" style={{ gridTemplateRows: `auto repeat(${labelRows}, auto) 1fr` }}>
      {days.map((d, i) => (
        <div
          key={`bg-${d}`}
          aria-hidden
          className={cx(
            i > 0 && "border-l border-outline-variant",
            d === t && "bg-surface-container-lowest",
          )}
          style={{ gridColumn: i + 1, gridRow: "1 / -1" }}
        />
      ))}
      {days.map((d, i) => (
        <div key={`head-${d}`} className="flex min-w-0 flex-col px-3 pt-3 pb-2" style={{ gridColumn: i + 1, gridRow: 1 }}>
          <span className={cx("text-label-medium", d === t ? "text-primary" : "text-on-surface-variant")}>{fmtDate(d, { weekday: "short" })}</span>
          <span className="font-serif text-[30px] leading-8 text-on-surface">{Number(d.slice(8))}</span>
        </div>
      ))}
      {long.map((s) => {
        const meta = [s.e.allDay ? null : `${fmtTime(s.e.startsAt)} to ${fmtDate(localDateOf(new Date(s.e.endsAt)), { weekday: "short" })}`, whose(s.e)]
          .filter(Boolean)
          .join(" · ");
        return (
          <button
            key={s.e.id}
            type="button"
            onClick={() => onOpenEvent(s.e)}
            style={{ gridColumn: `${s.from + 1} / ${s.to + 2}`, gridRow: s.row + 2 }}
            className={cx("state-layer mb-1 block min-w-0 pt-0.5 text-left", s.before ? "pl-0" : "pl-3", s.after ? "pr-0" : "pr-3")}
          >
            <span className={cx("flex min-w-0 items-baseline gap-2", s.before && "pl-3", s.after && "pr-3")}>
              {s.before && <span className="text-label-small text-on-surface-variant">‹</span>}
              <span className="max-w-full shrink-0 truncate text-body-small text-on-surface">{s.e.title}</span>
              {meta && <span className="min-w-0 truncate text-label-small text-on-surface-variant">{meta}</span>}
              {s.after && <span className="ml-auto text-label-small text-on-surface-variant">›</span>}
            </span>
            {/* The line runs across every day the plan covers. */}
            <span aria-hidden className={cx("mt-1 block h-0.5", planTone(s.e, rel).dot)} />
          </button>
        );
      })}
      {columns.map(({ d, untimed, entries }, i) => (
        <div key={d} className="flex min-h-[420px] min-w-0 flex-col gap-1 px-3 pt-2 pb-6" style={{ gridColumn: i + 1, gridRow: labelRows + 2 }}>
          {untimed.map(task)}
          {entries.map((x) =>
            x.kind === "task" ? (
              task(x.o)
            ) : (
              <div key={x.e.id} className={cx("my-1 border-l-2 pl-2", planTone(x.e, rel).rule)}>
                <button type="button" onClick={() => onOpenEvent(x.e)} className="state-layer -ml-2 block w-[calc(100%+0.5rem)] py-0.5 pl-2 text-left">
                  <span className="line-clamp-2 block text-body-small break-words text-on-surface">{x.e.title}</span>
                  <span className="block text-label-small text-on-surface-variant">{[span(x.e), whose(x.e)].filter(Boolean).join(" · ")}</span>
                </button>
                {x.during.length > 0 && <div className="mt-0.5 flex flex-col gap-1">{x.during.map(task)}</div>}
              </div>
            ),
          )}
        </div>
      ))}
    </div>
  );
}
