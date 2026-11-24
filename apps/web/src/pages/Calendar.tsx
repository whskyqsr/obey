import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useEvents, useOccurrences } from "../api/hooks";
import type { CalendarEvent, Occurrence } from "../api/types";
import { EventDialog, eventOn } from "../components/EventDialog";
import { useMediaQuery } from "../lib/useMediaQuery";
import { OccurrenceCard, isOverdue } from "../components/OccurrenceCard";
import { Button, Diamond, Dialog, type DiamondState, ErrorBox, Fab, IconButton, Loading, PageHeader, SegmentedButtons, cx } from "../components/ui";
import { useOpenOnNew } from "../lib/newParam";
import { WeekColumns } from "../components/WeekColumns";
import { addDays, addMonths, daysBetween, fmtDate, fmtMonth, fmtTime, localDateOf, monthGrid, startOfWeek, today } from "../lib/dates";
import { storage } from "../lib/storage";
import { useRel } from "../lib/relationship";
import { planPeople, planTone } from "../lib/planColors";
import type { WeekStart } from "../api/types";

type View = "week" | "month";
/** All-day and multi-day plans head their days, like any calendar. */
const inTopStrip = (e: CalendarEvent) => e.allDay || new Date(e.endsAt).getTime() - new Date(e.startsAt).getTime() >= 86_400_000;
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const weekdayLabels = (ws: WeekStart) => (ws === "mon" ? WEEKDAY_LABELS : ["Sun", ...WEEKDAY_LABELS.slice(0, 6)]);

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
  // The + menu's "Plan".
  useOpenOnNew(() => setPlan(null), !rel.endedAt);

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
  // "Oct 18–24", or "Oct 25–Nov 1" across a month.
  const range = `${fmtDate(from, { month: "short", day: "numeric" })}–${sameMonth ? Number(to.slice(8)) : fmtDate(to, { month: "short", day: "numeric" })}`;
  const t = today();
  const thisWeek = startOfWeek(t, weekStart);
  const shownWeek = startOfWeek(anchor, weekStart);
  const weekName =
    shownWeek === thisWeek ? "This week" : shownWeek === addDays(thisWeek, 7) ? "Next week" : shownWeek === addDays(thisWeek, -7) ? "Last week" : range;
  const heading = view === "month" ? (anchor.slice(0, 4) === t.slice(0, 4) ? fmtDate(anchor, { month: "long" }) : fmtMonth(anchor)) : weekName;
  const away = view === "month" ? anchor.slice(0, 7) !== t.slice(0, 7) : shownWeek !== thisWeek;
  // Phone week rows start closed; tap a day to open it.
  const [openDay, setOpenDay] = useState("");
  const month = anchor.slice(0, 7);
  const selectedItems = byDay.get(selected) ?? [];
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = occ.data?.find((o) => o.id === detailId);
  // Like a new calendar event: on the picked day in month view, else today if it's on screen, else the week's first day.
  const newTaskDay = view === "month" ? selected : days.includes(t) ? t : from;

  return (
    <>
      <PageHeader
        hero
        title={heading}
        tools={
          <>
            <IconButton icon="checklist" label="All tasks" onClick={() => void navigate({ to: "/tasks" })} />
            {!desk && (
              <IconButton
                icon={view === "month" ? "view_week" : "calendar_month"}
                label={view === "month" ? "Show the week" : "Show the month"}
                onClick={() => setView(view === "month" ? "week" : "month")}
              />
            )}
          </>
        }
        actions={
          <>
            {view === "week" && heading !== range && <span className="mr-1 text-body-large text-on-surface-variant">{range}</span>}
            <IconButton icon="chevron_left" label={view === "month" ? "Previous month" : "Previous week"} onClick={() => step(-1)} />
            <IconButton icon="chevron_right" label={view === "month" ? "Next month" : "Next week"} onClick={() => step(1)} />
            {desk && (
              <SegmentedButtons
                className="ml-2"
                value={view}
                onChange={setView}
                options={[
                  { value: "week", label: "Week" },
                  { value: "month", label: "Month" },
                ]}
              />
            )}
            {desk && !rel.endedAt && (
              <Button variant="outlined" icon="event" onClick={() => setPlan(null)} className="ml-2">
                Plan
              </Button>
            )}
          </>
        }
      />
      {away && (
        <div className="-mt-2 flex items-center gap-2 px-4 pb-3 md:px-6">
          {away && (
            <Button
              variant="text"
              onClick={() => {
                setAnchor(t);
                setSelected(t);
              }}
            >
              {view === "month" ? "Back to this month" : "Back to this week"}
            </Button>
          )}
        </div>
      )}
      {occ.error && <ErrorBox error={occ.error} onRetry={() => occ.refetch()} />}

      {view === "month" ? (
        // Letters month (mockup 13): serif dates with a diamond for the day's tasks and an accent bar for plans, then the
        // chosen day as hairline rows. Desktop puts the day beside the month.
        <div className="px-4 md:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-12">
          <div>
            <div className="grid grid-cols-7 text-center text-label-medium text-on-surface-variant">
              {weekdayLabels(weekStart).map((d, i) => (
                <div key={i} className="py-2" aria-label={d}>
                  {d[0]}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-1">
              {days.map((d) => {
                if (!d.startsWith(month)) return <span key={d} aria-hidden />;
                const items = byDay.get(d) ?? [];
                const plans = eventsOn(d).length > 0;
                const on = selected === d;
                const state = monthState(items);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setSelected(d)}
                    aria-pressed={on}
                    aria-label={fmtDate(d, { weekday: "long", month: "long", day: "numeric" })}
                    className={cx(
                      "state-layer mx-auto flex h-[52px] w-full max-w-[52px] flex-col items-center justify-start rounded-md pt-1 lg:h-[72px] lg:max-w-[72px] lg:pt-2",
                      on && "bg-on-surface",
                    )}
                  >
                    <span
                      className={cx(
                        "font-serif text-[22px] leading-7 lg:text-[30px] lg:leading-9",
                        on ? "text-surface" : d === t ? "text-primary" : "text-on-surface",
                      )}
                    >
                      {Number(d.slice(8))}
                    </span>
                    <span className="flex h-2 items-center gap-1.5">
                      {state && !on && <Diamond state={state} size={6} />}
                      {state && on && <span className="size-[6px] rotate-45 bg-surface" />}
                      {plans && <span className={cx("h-[3px] w-3 rounded-full", on ? "bg-surface" : "bg-primary")} />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <section className="mt-6 border-t border-outline-variant pt-5 lg:mt-0 lg:border-t-0 lg:pt-2">
            <h2 className="eyebrow mb-2">{fmtDate(selected, { weekday: "long", month: "short", day: "numeric" })}</h2>
            {occ.isLoading ? (
              <Loading />
            ) : selectedItems.length || eventsOn(selected).length ? (
              <div className="flex flex-col">
                {eventsOn(selected).map((e) => (
                  <EventItem key={e.id} e={e} onOpen={() => setPlan(e)} large />
                ))}
                {selectedItems.map((o) => (
                  <DayRow key={o.id} o={o} clash={clashing.has(o.id)} onOpen={() => setDetailId(o.id)} />
                ))}
              </div>
            ) : (
              <p className="py-3 text-body-medium text-on-surface-variant">Nothing that day.</p>
            )}
          </section>
        </div>
      ) : desk ? (
        <WeekColumns
          days={days}
          occurrences={(occ.data ?? []).filter((o) => o.status !== "cancelled")}
          events={events.data ?? []}
          clashing={clashing}
          onOpenTask={(o) => setDetailId(o.id)}
          onOpenEvent={setPlan}
        />
      ) : (
        // Letters: one hairline row per day, a diamond for each task, and a word on how it went. Tap a day to open it.
        <div className="mx-4 border-t border-outline-variant md:mx-6">
          {days.map((d) => {
            const items = byDay.get(d) ?? [];
            // Like any calendar: all-day and multi-day plans head the day.
            const dayEvents = eventsOn(d).sort((a, b) => Number(inTopStrip(b)) - Number(inTopStrip(a)) || a.startsAt.localeCompare(b.startsAt));
            const open = d === openDay;
            return (
              <div
                key={d}
                className={cx(
                  "border-b border-outline-variant",
                  d === t && "-mx-4 border-l-2 border-l-primary bg-surface-container-lowest px-[14px] md:-mx-6 md:px-[22px]",
                )}
              >
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenDay(open ? "" : d)}
                  className="state-layer flex min-h-[68px] w-full items-center gap-4 py-2 text-left"
                >
                  <span className="flex w-10 shrink-0 flex-col">
                    <span className="text-label-medium text-on-surface-variant">{fmtDate(d, { weekday: "short" })}</span>
                    <span className={cx("font-serif text-[28px] leading-7", d === t ? "text-primary" : "text-on-surface")}>{Number(d.slice(8))}</span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-3" aria-hidden>
                    {items.map((o) => (
                      <Diamond key={o.id} state={dayState(o)} size={12} />
                    ))}
                  </span>
                  <span className={cx("shrink-0 text-body-medium", items.some((o) => dayState(o) === "owed") ? "text-error" : "text-on-surface-variant")}>
                    {daySummary(items, dayEvents, d, t, occ.isLoading)}
                  </span>
                </button>
                {open && (items.length > 0 || dayEvents.length > 0) && (
                  <div className="flex flex-col gap-1 pb-3 pl-14">
                    {dayEvents.map((e) => (
                      <EventItem key={e.id} e={e} onOpen={() => setPlan(e)} />
                    ))}
                    {items.map((o) => (
                      <WeekItem key={o.id} o={o} clash={clashing.has(o.id)} onOpen={() => setDetailId(o.id)} />
                    ))}
                  </div>
                )}
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
      <EventDialog
        event={plan ?? null}
        day={view === "month" ? selected : days.includes(t) ? t : from}
        open={plan !== undefined}
        onClose={() => setPlan(undefined)}
      />
      {isDom && (
        <Fab
          icon="add"
          label="New task"
          className="max-md:hidden"
          onClick={() => navigate({ to: "/tasks/$taskId", params: { taskId: "new" }, search: { start: newTaskDay } })}
        />
      )}
    </>
  );
}

/** A plan: an accent rule down its side and whose it is, so it never reads as a task. */
function EventItem({ e, onOpen, large }: { e: CalendarEvent; onOpen(): void; large?: boolean }) {
  const { rel, me } = useRel();
  const whose =
    e.withPartner || planPeople(rel).length < 2
      ? null
      : e.authorId === me.user.id
        ? "You"
        : (rel.members.find((m) => m.userId === e.authorId)?.displayName ?? "Them");
  return (
    <button type="button" onClick={onOpen} className={cx("state-layer flex w-full text-left", large ? "border-b border-outline-variant py-3" : "py-1")}>
      <span className={cx("min-w-0 flex-1 border-l-2", planTone(e, rel).rule, large ? "pl-4" : "pl-2")}>
        <span className={cx("line-clamp-2 block break-words text-on-surface", large ? "text-body-large" : "text-body-small")}>{e.title}</span>
        <span className={cx("block text-on-surface-variant", large ? "text-body-medium" : "text-label-small")}>
          {[
            e.allDay ? "All day" : `${fmtTime(e.startsAt)}–${fmtTime(e.endsAt)}`,
            whose,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
    </button>
  );
}

/** One diamond for a day in the month: owed if anything was missed, filled once all is done, open while some are to do. */
function monthState(items: Occurrence[]): DiamondState | null {
  if (!items.length) return null;
  const states = items.map(dayState);
  if (states.includes("owed")) return "owed";
  if (states.every((s) => s === "done" || s === "off")) return "done";
  if (states.includes("waiting")) return "waiting";
  return "open";
}

/** A task in the chosen day's list: diamond, name, time. */
function DayRow({ o, clash, onOpen }: { o: Occurrence; clash?: boolean; onOpen(): void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="state-layer flex w-full items-center gap-4 border-b border-outline-variant py-3.5 text-left last:border-b-0"
    >
      <Diamond state={dayState(o)} size={16} />
      <span className="min-w-0 flex-1 text-body-large break-words text-on-surface">{o.title}</span>
      <span className={cx("shrink-0 text-body-medium", clash ? "text-error" : "text-on-surface-variant")}>{fmtTime(o.dueAt)}</span>
    </button>
  );
}

/** A task's diamond in the week: filled when done, oxblood when missed, a hollow one while it's still to do. */
function dayState(o: Occurrence): DiamondState {
  if (o.status === "completed") return "done";
  if (o.status === "missed" || isOverdue(o)) return "owed";
  if (o.status === "submitted") return "waiting";
  if (o.status === "excused") return "off";
  return "open";
}

/** "1 missed", "all done", "2 of 6", or the day's plan when there's nothing to count yet. */
function daySummary(items: Occurrence[], events: CalendarEvent[], d: string, t: string, loading: boolean) {
  if (loading) return "";
  const missed = items.filter((o) => dayState(o) === "owed").length;
  const done = items.filter((o) => o.status === "completed" || o.status === "excused").length;
  const plan = events[0] ? `${events[0].title}${events[0].allDay ? "" : ` ${fmtTime(events[0].startsAt)}`}` : null;
  if (!items.length) return plan ?? "Off day";
  if (missed) return `${missed} missed`;
  if (done === items.length) return "all done";
  if (d === t) return `${done} of ${items.length}`;
  return plan ?? (d < t ? `${done} of ${items.length}` : "");
}

/** A task in a desktop day column, as in the mockup: its diamond and name, quieter once it's settled. */
function ColumnItem({ o, clash, onOpen }: { o: Occurrence; clash?: boolean; onOpen(): void }) {
  const state = dayState(o);
  const settled = state === "done" || state === "off";
  return (
    <button type="button" onClick={onOpen} title={fmtTime(o.dueAt)} className="state-layer -mx-1 flex items-start gap-2 rounded-sm px-1 py-1 text-left">
      <Diamond state={state} size={10} className="mt-1 shrink-0" />
      <span
        className={cx(
          "line-clamp-2 min-w-0 flex-1 text-body-small break-words",
          clash ? "text-error" : settled ? "text-on-surface-variant" : "text-on-surface",
        )}
      >
        {o.title}
      </span>
    </button>
  );
}

function WeekItem({ o, clash, onOpen }: { o: Occurrence; clash?: boolean; onOpen(): void }) {
  const state = dayState(o);
  return (
    <button type="button" onClick={onOpen} className="state-layer flex w-full items-center gap-3 py-1.5 text-left">
      <Diamond state={state} size={11} className="shrink-0" />
      <span className={cx("min-w-0 flex-1 text-body-medium break-words", state === "done" || state === "off" ? "text-on-surface-variant" : "text-on-surface")}>
        {o.title}
      </span>
      <span className={cx("shrink-0 text-label-medium", clash ? "text-error" : "text-on-surface-variant")}>{fmtTime(o.dueAt)}</span>
    </button>
  );
}
