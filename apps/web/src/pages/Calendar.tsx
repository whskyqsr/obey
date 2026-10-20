import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useEvents, useOccurrences } from "../api/hooks";
import type { CalendarEvent, Occurrence } from "../api/types";
import { EventDialog, eventOn } from "../components/EventDialog";
import { MonthWeeks, WeekGrid, inTopStrip } from "../components/WeekGrid";
import { useMediaQuery } from "../lib/useMediaQuery";
import { OccurrenceCard, isOverdue } from "../components/OccurrenceCard";
import { Button, Dialog, ErrorBox, Fab, Icon, IconButton, Loading, PageHeader, SegmentedButtons, cx } from "../components/ui";
import { addDays, addMonths, daysBetween, fmtDate, fmtMonth, fmtTime, localDateOf, monthGrid, startOfWeek, today } from "../lib/dates";
import { storage } from "../lib/storage";
import { useRel } from "../lib/relationship";
import { planLegend, planTone } from "../lib/planColors";
import type { WeekStart } from "../api/types";

type View = "week" | "month";
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const weekdayLabels = (ws: WeekStart) => (ws === "mon" ? WEEKDAY_LABELS : ["Sun", ...WEEKDAY_LABELS.slice(0, 6)]);

function dotClass(o: Occurrence) {
  if (o.status === "completed") return "bg-primary";
  if (o.status === "missed" || isOverdue(o)) return "bg-error";
  if (o.status === "submitted") return "bg-tertiary";
  if (o.status === "excused" || o.status === "cancelled") return "bg-outline";
  // Still to do: an open ring, so it reads differently from done at dot size.
  return "border-[1.5px] border-on-surface-variant";
}

export function CalendarPage() {
  const { rel, isDom, me } = useRel();
  const weekStart = me.user.weekStart ?? "sun";
  const navigate = useNavigate();
  const [view, setViewState] = useState<View>(() => (storage.get("obey.calendar.view") === "month" ? "month" : "week"));
  const setView = (v: View) => {
    storage.set("obey.calendar.view", v);
    setViewState(v);
  };
  // Desktop gets a real calendar: an hourly week and a month with plans spanning their days.
  const desk = useMediaQuery("(min-width: 1024px)");
  const [anchor, setAnchor] = useState(today());
  const [selected, setSelected] = useState(today());

  const days = view === "week" ? daysBetween(startOfWeek(anchor, weekStart), addDays(startOfWeek(anchor, weekStart), 6)) : monthGrid(anchor, weekStart);
  const from = days[0]!;
  const to = days[days.length - 1]!;
  const occ = useOccurrences(rel.id, from, to);
  const events = useEvents(rel.id, from, to);
  const eventsOn = (d: string) => (events.data ?? []).filter((e) => eventOn(e, d));
  const clashing = useMemo(() => new Set((events.data ?? []).flatMap((e) => e.conflictIds)), [events.data]);
  // undefined: closed; null: a new plan; otherwise that plan.
  const [plan, setPlan] = useState<CalendarEvent | null | undefined>(undefined);

  const byDay = useMemo(() => {
    const map = new Map<string, Occurrence[]>();
    for (const o of occ.data ?? []) {
      if (o.status === "cancelled") continue;
      const d = localDateOf(new Date(o.dueAt));
      map.set(d, [...(map.get(d) ?? []), o]);
    }
    for (const list of map.values()) list.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    return map;
  }, [occ.data]);

  const step = (dir: 1 | -1) => setAnchor((a) => (view === "week" ? addDays(a, 7 * dir) : addMonths(a, dir)));
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  // "Oct 18 – 24", or "Oct 25 – Nov 1" across a month; the year only on wide screens, where it fits.
  const weekTitle = `${fmtDate(from, { month: "short", day: "numeric" })} – ${sameMonth ? Number(to.slice(8)) : fmtDate(to, { month: "short", day: "numeric" })}`;
  const title = view === "month" ? fmtMonth(anchor) : weekTitle;
  const t = today();
  const month = anchor.slice(0, 7);
  const selectedItems = byDay.get(selected) ?? [];
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = occ.data?.find((o) => o.id === detailId);
  // Like a new calendar event: on the picked day in month view, else today if it's on screen, else the week's first day.
  const newTaskDay = view === "month" ? selected : days.includes(t) ? t : from;
  const legend = planLegend(rel, me.user.id);

  return (
    <>
      <PageHeader
        title="Calendar"
        actions={
          <SegmentedButtons
            value={view}
            onChange={setView}
            options={[
              { value: "week", label: "Week" },
              { value: "month", label: "Month" },
            ]}
          />
        }
      />
      <div className="flex items-center gap-1 px-4 pb-3 md:px-6">
        <IconButton icon="chevron_left" label="Previous" onClick={() => step(-1)} />
        <IconButton icon="chevron_right" label="Next" onClick={() => step(1)} />
        <h2 className="min-w-0 flex-1 truncate px-2 text-title-large text-on-surface">{title}</h2>
        {!rel.endedAt && (
          <>
            <span className="md:hidden">
              <IconButton icon="event" label="New plan" onClick={() => setPlan(null)} />
            </span>
            <span className="hidden md:block">
              <Button variant="tonal" icon="event" onClick={() => setPlan(null)}>
                Plan
              </Button>
            </span>
          </>
        )}
        <Button
          variant="text"
          onClick={() => {
            setAnchor(t);
            setSelected(t);
          }}
        >
          Today
        </Button>
      </div>
      {legend.length > 0 && (
        <div className="-mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 px-6 pb-3 text-label-medium text-on-surface-variant md:px-8">
          {legend.map((l) => (
            <span key={l.label} className="flex items-center gap-1.5">
              <span className={cx("size-2.5 rounded-full", l.tone.dot)} />
              {l.label}
            </span>
          ))}
        </div>
      )}
      {occ.error && <ErrorBox error={occ.error} onRetry={() => occ.refetch()} />}

      {view === "month" ? (
        <div className="px-2 md:px-6">
          <div className="grid grid-cols-7 text-center text-label-medium text-on-surface-variant">
            {weekdayLabels(weekStart).map((d) => (
              <div key={d} className="py-2">
                {d}
              </div>
            ))}
          </div>
          {desk ? (
            <MonthWeeks
              days={days}
              month={month}
              selected={selected}
              occurrences={(occ.data ?? []).filter((o) => o.status !== "cancelled")}
              events={events.data ?? []}
              onSelect={setSelected}
              onOpenEvent={setPlan}
            />
          ) : (
            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg bg-outline-variant">
              {days.map((d) => {
                const items = byDay.get(d) ?? [];
                const dayEvents = eventsOn(d);
                const inMonth = d.startsWith(month);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setSelected(d)}
                    className={cx(
                      "state-layer flex min-h-16 flex-col items-stretch gap-1 p-1 text-left md:min-h-24 md:p-1.5",
                      selected === d ? "bg-secondary-container" : inMonth ? "bg-surface-container-low" : "bg-surface",
                    )}
                  >
                    <span
                      className={cx(
                        "mx-auto flex size-7 items-center justify-center rounded-full text-label-large md:mx-0",
                        d === t ? "bg-primary text-on-primary" : inMonth ? "text-on-surface" : "text-on-surface-variant/60",
                      )}
                    >
                      {Number(d.slice(8))}
                    </span>
                    {/* compact: a bar for plans and dots for tasks; wide: titles */}
                    {dayEvents.length > 0 && (
                      <span className="mx-1 flex gap-0.5 md:hidden">
                        {[...new Set(dayEvents.map((e) => planTone(e, rel).dot))].slice(0, 3).map((dot) => (
                          <span key={dot} className={cx("h-1 flex-1 rounded-full", dot)} />
                        ))}
                      </span>
                    )}
                    <span className="flex flex-wrap justify-center gap-0.5 md:hidden">
                      {items.slice(0, 4).map((o) => (
                        <span key={o.id} className={cx("size-1.5 rounded-full", dotClass(o))} />
                      ))}
                    </span>
                    <span className="hidden flex-col gap-0.5 md:flex">
                      {dayEvents.slice(0, 2).map((e) => (
                        <span key={e.id} className={cx("truncate rounded-xs px-1 text-label-small", planTone(e, rel).bg, planTone(e, rel).text)}>
                          {e.title}
                        </span>
                      ))}
                      {items.slice(0, 3 - Math.min(dayEvents.length, 2)).map((o) => (
                        <span key={o.id} className="flex items-center gap-1 truncate text-label-small text-on-surface-variant">
                          <span className={cx("size-1.5 shrink-0 rounded-full", dotClass(o))} />
                          <span className="truncate">{o.title}</span>
                        </span>
                      ))}
                      {items.length + Math.min(dayEvents.length, 2) > 3 && (
                        <span className="text-label-small text-primary">+{items.length + Math.min(dayEvents.length, 2) - 3} more</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="mt-6 px-2 md:px-0">
            <h3 className="mb-2 text-title-medium text-on-surface-variant">{fmtDate(selected, { weekday: "long", month: "long", day: "numeric" })}</h3>
            {occ.isLoading ? (
              <Loading />
            ) : selectedItems.length || eventsOn(selected).length ? (
              <div className="grid gap-2 lg:grid-cols-2">
                {eventsOn(selected).map((e) => (
                  <EventItem key={e.id} e={e} onOpen={() => setPlan(e)} large />
                ))}
                {selectedItems.map((o) => (
                  <OccurrenceCard key={o.id} o={o} />
                ))}
              </div>
            ) : (
              <p className="text-body-medium text-on-surface-variant">Nothing scheduled.</p>
            )}
          </div>
        </div>
      ) : desk ? (
        <WeekGrid
          days={days}
          occurrences={(occ.data ?? []).filter((o) => o.status !== "cancelled")}
          events={events.data ?? []}
          clashing={clashing}
          onOpenTask={(o) => setDetailId(o.id)}
          onOpenEvent={setPlan}
        />
      ) : (
        <div className="grid gap-3 px-4 md:grid-cols-7 md:gap-2 md:px-6">
          {days.map((d) => {
            const items = byDay.get(d) ?? [];
            // Like any calendar: all-day and multi-day plans head the day.
            const dayEvents = eventsOn(d).sort((a, b) => Number(inTopStrip(b)) - Number(inTopStrip(a)) || a.startsAt.localeCompare(b.startsAt));
            // On a phone an empty day is a thin row rather than a whole card.
            const empty = !items.length && !dayEvents.length && !occ.isLoading;
            return (
              <div key={d} className={cx("rounded-lg md:min-h-64 md:p-2", empty ? "px-2 py-1" : "p-2", d === t ? "bg-secondary-container/60" : "bg-surface-container-low")}>
                <div className={cx("flex items-baseline gap-2 px-1 md:mb-2 md:flex-col md:gap-0", !empty && "mb-2")}>
                  <span className="text-label-medium text-on-surface-variant">{fmtDate(d, { weekday: "short" })}</span>
                  <span className={cx(empty ? "text-title-medium md:text-title-large" : "text-title-large", d === t ? "text-primary" : "text-on-surface")}>
                    {Number(d.slice(8))}
                  </span>
                  {empty && <span className="text-body-small text-on-surface-variant/70 md:hidden">Nothing scheduled</span>}
                </div>
                <div className="flex flex-col gap-1">
                  {dayEvents.map((e) => (
                    <EventItem key={e.id} e={e} onOpen={() => setPlan(e)} />
                  ))}
                  {items.map((o) => (
                    <WeekItem key={o.id} o={o} clash={clashing.has(o.id)} onOpen={() => setDetailId(o.id)} />
                  ))}
                  {empty && <span className="hidden px-1 text-body-small text-on-surface-variant/70 md:block">—</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Dialog
        open={!!detail}
        onClose={() => setDetailId(null)}
        actions={
          <Button variant="text" onClick={() => setDetailId(null)}>
            Close
          </Button>
        }
      >
        {detail && <OccurrenceCard o={detail} showDate />}
      </Dialog>
      <EventDialog event={plan ?? null} day={view === "month" ? selected : days.includes(t) ? t : from} open={plan !== undefined} onClose={() => setPlan(undefined)} />
      {isDom && <Fab icon="add" label="New task" onClick={() => navigate({ to: "/tasks/$taskId", params: { taskId: "new" }, search: { start: newTaskDay } })} />}
    </>
  );
}

/** A plan in the week or day list: tinted in its person's colour, so it never reads as a task. */
function EventItem({ e, onOpen, large }: { e: CalendarEvent; onOpen(): void; large?: boolean }) {
  const { rel } = useRel();
  const tone = planTone(e, rel);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cx("state-layer flex w-full items-start gap-2 rounded-sm text-left", tone.bg, tone.text, large ? "rounded-md p-4" : "px-2 py-1.5")}
    >
      <Icon name="event" size={large ? 24 : 16} className="mt-0.5 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className={cx("line-clamp-2 block break-words", large ? "text-title-medium" : "text-label-large")}>{e.title}</span>
        <span className={cx("block opacity-80", large ? "text-body-medium" : "text-label-small")}>
          {e.allDay ? "All day" : `${fmtTime(e.startsAt)} – ${fmtTime(e.endsAt)}`}
          {e.conflictIds.length > 0 && ` · overlaps ${e.conflictIds.length === 1 ? "a task" : `${e.conflictIds.length} tasks`}`}
        </span>
      </span>
    </button>
  );
}

function WeekItem({ o, clash, onOpen }: { o: Occurrence; clash?: boolean; onOpen(): void }) {
  return (
    <button type="button" onClick={onOpen} className="state-layer flex w-full items-start gap-2 rounded-sm bg-surface px-2 py-1.5 text-left">
      <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", dotClass(o))} />
      <span className="min-w-0 flex-1">
        <span className={cx("line-clamp-2 block text-label-large break-words text-on-surface", o.status === "completed" && "line-through opacity-70")}>{o.title}</span>
        <span className={cx("flex items-center gap-1 text-label-small", clash ? "text-error" : "text-on-surface-variant")}>
          {fmtTime(o.dueAt)}
          {clash && <Icon name="event_busy" size={14} />}
        </span>
      </span>
    </button>
  );
}
