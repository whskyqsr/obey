import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useOccurrences } from "../api/hooks";
import type { Occurrence } from "../api/types";
import { OccurrenceCard, isOverdue } from "../components/OccurrenceCard";
import { Button, Dialog, ErrorBox, Fab, IconButton, Loading, PageHeader, SegmentedButtons, cx } from "../components/ui";
import { addDays, addMonths, daysBetween, fmtDate, fmtMonth, fmtTime, localDateOf, monthGrid, startOfWeek, today } from "../lib/dates";
import { storage } from "../lib/storage";
import { useRel } from "../lib/relationship";
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
  const [anchor, setAnchor] = useState(today());
  const [selected, setSelected] = useState(today());

  const days = view === "week" ? daysBetween(startOfWeek(anchor, weekStart), addDays(startOfWeek(anchor, weekStart), 6)) : monthGrid(anchor, weekStart);
  const from = days[0]!;
  const to = days[days.length - 1]!;
  const occ = useOccurrences(rel.id, from, to);

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
  const title = view === "month" ? fmtMonth(anchor) : `${fmtDate(from, { month: "short", day: "numeric" })} – ${fmtDate(to, { month: "short", day: "numeric", year: "numeric" })}`;
  const t = today();
  const month = anchor.slice(0, 7);
  const selectedItems = byDay.get(selected) ?? [];
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = occ.data?.find((o) => o.id === detailId);
  // Like a new calendar event: on the picked day in month view, else today if it's on screen, else the week's first day.
  const newTaskDay = view === "month" ? selected : days.includes(t) ? t : from;

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
        <h2 className="flex-1 px-2 text-title-large text-on-surface">{title}</h2>
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
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg bg-outline-variant">
            {days.map((d) => {
              const items = byDay.get(d) ?? [];
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
                  {/* compact: dots; wide: titles */}
                  <span className="flex flex-wrap justify-center gap-0.5 md:hidden">
                    {items.slice(0, 4).map((o) => (
                      <span key={o.id} className={cx("size-1.5 rounded-full", dotClass(o))} />
                    ))}
                  </span>
                  <span className="hidden flex-col gap-0.5 md:flex">
                    {items.slice(0, 3).map((o) => (
                      <span key={o.id} className="flex items-center gap-1 truncate text-label-small text-on-surface-variant">
                        <span className={cx("size-1.5 shrink-0 rounded-full", dotClass(o))} />
                        <span className="truncate">{o.title}</span>
                      </span>
                    ))}
                    {items.length > 3 && <span className="text-label-small text-primary">+{items.length - 3} more</span>}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-6 px-2 md:px-0">
            <h3 className="mb-2 text-title-medium text-on-surface-variant">{fmtDate(selected, { weekday: "long", month: "long", day: "numeric" })}</h3>
            {occ.isLoading ? (
              <Loading />
            ) : selectedItems.length ? (
              <div className="grid gap-2 lg:grid-cols-2">
                {selectedItems.map((o) => (
                  <OccurrenceCard key={o.id} o={o} />
                ))}
              </div>
            ) : (
              <p className="text-body-medium text-on-surface-variant">Nothing scheduled.</p>
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-3 px-4 md:grid-cols-7 md:gap-2 md:px-6">
          {days.map((d) => {
            const items = byDay.get(d) ?? [];
            // On a phone an empty day is a thin row rather than a whole card.
            const empty = !items.length && !occ.isLoading;
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
                  {items.map((o) => (
                    <WeekItem key={o.id} o={o} onOpen={() => setDetailId(o.id)} />
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
      {isDom && <Fab icon="add" label="New task" onClick={() => navigate({ to: "/tasks/$taskId", params: { taskId: "new" }, search: { start: newTaskDay } })} />}
    </>
  );
}

function WeekItem({ o, onOpen }: { o: Occurrence; onOpen(): void }) {
  return (
    <button type="button" onClick={onOpen} className="state-layer flex w-full items-start gap-2 rounded-sm bg-surface px-2 py-1.5 text-left">
      <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", dotClass(o))} />
      <span className="min-w-0 flex-1">
        <span className={cx("line-clamp-2 block text-label-large break-words text-on-surface", o.status === "completed" && "line-through opacity-70")}>{o.title}</span>
        <span className="block text-label-small text-on-surface-variant">{fmtTime(o.dueAt)}</span>
      </span>
    </button>
  );
}
