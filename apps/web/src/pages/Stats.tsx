import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useLedger, useMonth, useStats } from "../api/hooks";
import type { DynamicStats, Tally } from "../api/types";
import { MoodCard } from "../components/Mood";
import { Chip, ErrorBox, IconButton, Loading, PageHeader, SegmentedButtons, cx } from "../components/ui";
import { addDays, addMonths, fmtDate, fmtMonth, localDateOf, today } from "../lib/dates";
import { useRel } from "../lib/relationship";

// "Month" is a calendar month, the same stretch the monthly review counts, so the two always agree.
const RANGES = [
  { value: "7", label: "Week", before: "the week before" },
  { value: "month", label: "Month", before: "the month before" },
  { value: "90", label: "3 months", before: "the 3 months before" },
  { value: "365", label: "Year", before: "the year before" },
] as const;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const pct = (rate: number) => `${Math.round(rate * 100)}%`;
const monthOf = (date: string) => date.slice(0, 7);
const shiftMonth = (month: string, by: number) => monthOf(addMonths(`${month}-01`, by));

/**
 * Mockup 26: three serif numbers, then each task as a line with an ink bar, and points earned, spent and lost. Over
 * time, weekdays and mood follow on hairlines.
 */
export function StatsPage({ month: startMonth, who: startWho }: { month?: string; who?: string } = {}) {
  const { rel, me, memberName, features } = useRel();
  const current = monthOf(today());
  const [range, setRange] = useState<string>("month");
  const [month, setMonth] = useState(startMonth && startMonth <= current ? startMonth : current);
  const sub = rel.members.find((m) => m.role === "submissive")?.userId;
  const [who, setWho] = useState<string>(rel.members.some((m) => m.userId === startWho) ? startWho! : (sub ?? me.user.id));
  const byMonth = range === "month";
  const stats = useStats(rel.id, Number(range), who, byMonth ? month : undefined);
  const ledger = useLedger(rel.id, features.points);
  const before = byMonth ? fmtDate(`${shiftMonth(month, -1)}-01`, { month: "long" }) : RANGES.find((r) => r.value === range)!.before;
  const from = byMonth ? `${month}-01` : addDays(today(), -Number(range) + 1);
  const to = byMonth ? addDays(`${shiftMonth(month, 1)}-01`, -1) : today();
  const points = (ledger.data ?? []).filter((e) => e.userId === who && localDateOf(new Date(e.createdAt)) >= from && localDateOf(new Date(e.createdAt)) <= to);
  const earned = points.filter((e) => e.delta > 0).reduce((n, e) => n + e.delta, 0);
  const spent = -points.filter((e) => e.delta < 0 && (e.kind === "redemption" || e.kind === "delay")).reduce((n, e) => n + e.delta, 0);
  const lost = -points.filter((e) => e.delta < 0 && e.kind !== "redemption" && e.kind !== "delay").reduce((n, e) => n + e.delta, 0);

  return (
    <>
      <PageHeader
        title="Stats"
        actions={
          <div className="hidden md:block">
            <SegmentedButtons
              className="[&>*]:whitespace-nowrap"
              value={range}
              onChange={setRange}
              options={RANGES.map(({ value, label }) => ({ value, label }))}
            />
          </div>
        }
      />
      <div className="flex w-full max-w-3xl flex-col gap-10 px-4 pb-16 md:px-6">
        <div className="flex flex-col gap-4">
          <SegmentedButtons
            className="w-full md:hidden [&>*]:px-2 [&>*]:whitespace-nowrap"
            value={range}
            onChange={setRange}
            options={RANGES.map(({ value, label }) => ({ value, label }))}
          />
          {rel.members.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {rel.members.map((m) => (
                <Chip key={m.userId} plain selected={m.userId === who} onClick={() => setWho(m.userId)}>
                  {m.userId === me.user.id ? "You" : m.displayName}
                </Chip>
              ))}
            </div>
          )}
          {byMonth && (
            <div className="-ml-2 flex items-center gap-1">
              <IconButton icon="chevron_left" label="The month before" onClick={() => setMonth(shiftMonth(month, -1))} />
              <span className="text-body-large text-on-surface">
                {fmtMonth(`${month}-01`)}
                {month === current && <span className="text-on-surface-variant"> so far</span>}
              </span>
              <IconButton icon="chevron_right" label="The month after" disabled={month >= current} onClick={() => setMonth(shiftMonth(month, 1))} />
            </div>
          )}
          <ReviewOpen />
        </div>
        {stats.isPending ? (
          <Loading />
        ) : stats.error ? (
          <ErrorBox error={stats.error} onRetry={() => stats.refetch()} />
        ) : stats.data.totals.done + stats.data.totals.missed + stats.data.totals.excused === 0 ? (
          <p className="text-body-large text-on-surface-variant">
            {byMonth && month !== current ? `Nothing was due in ${fmtDate(`${month}-01`, { month: "long" })}.` : "Nothing finished in this stretch yet."}
          </p>
        ) : (
          <Body s={stats.data} before={before} name={who === me.user.id ? null : memberName(who)} />
        )}
        {features.points && points.length > 0 && (
          <section>
            <h2 className="eyebrow">Points</h2>
            <p className="mt-3 text-body-large text-on-surface">
              Earned {earned} · spent {spent} · lost {lost}
            </p>
          </section>
        )}
        {(!byMonth || month === current) && (
          <section>
            <MoodCard heading={<h2 className="eyebrow">Mood</h2>} days={byMonth ? 30 : Number(range)} person={who} />
          </section>
        )}
      </div>
    </>
  );
}

/** While this month's review is open and you haven't looked back yet, a line over to it. */
function ReviewOpen() {
  const { rel, me, features } = useRel();
  const navigate = useNavigate();
  const current = monthOf(today());
  const month = useMonth(rel.id, current, features.review && !rel.endedAt);
  if (!month.data?.reviewOpen || !month.data.waitingOn.includes(me.user.id)) return null;
  return (
    <button type="button" onClick={() => navigate({ to: "/review" })} className="self-start text-left text-body-large text-primary">
      {fmtDate(`${current}-01`, { month: "long" })}'s review is open · Look back ›
    </button>
  );
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-serif text-[64px] leading-[68px] text-on-surface tabular-nums">{value}</div>
      <div className="text-body-large text-on-surface-variant">{label}</div>
    </div>
  );
}

function Body({ s, before, name }: { s: DynamicStats; before: string; name: string | null }) {
  const t = s.totals;
  const due = t.done + t.missed;
  const best = Math.max(0, ...s.tasks.map((x) => x.streak));
  return (
    <>
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-x-10 gap-y-4">
          <Figure value={due ? pct(t.onTime / due) : "–"} label="on time" />
          <Figure value={String(best)} label="best streak" />
          <Figure value={String(t.missed)} label="missed" />
        </div>
        <p className="text-body-medium text-on-surface-variant">
          {[
            name ? `${name}'s tasks` : null,
            t.rate === null ? null : `${pct(t.rate)} done`,
            trend(t.rate, s.previous.rate, before),
            t.excused ? `${t.excused} excused` : null,
            t.moved ? `${t.moved} ${t.moved === 1 ? "deadline" : "deadlines"} moved` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </section>
      <section>
        <h2 className="eyebrow">By task</h2>
        <Tasks tasks={s.tasks} />
      </section>
      <section>
        <h2 className="eyebrow">Over time</h2>
        <div className="mt-4">
          <Bars s={s} />
        </div>
      </section>
      <section>
        <h2 className="eyebrow">By weekday</h2>
        <div className="mt-4">
          <Weekdays days={s.weekdays} />
        </div>
      </section>
    </>
  );
}

function trend(rate: number | null, previous: number | null, before: string) {
  if (rate === null || previous === null) return null;
  const diff = Math.round((rate - previous) * 100);
  return diff === 0 ? `same as ${before}` : `${diff > 0 ? "up" : "down"} ${Math.abs(diff)} ${Math.abs(diff) === 1 ? "point" : "points"} on ${before}`;
}

function bucketLabel(start: string, bucket: DynamicStats["bucket"], days: number) {
  if (bucket === "month") return fmtDate(start, { month: "short" });
  if (bucket === "week") return fmtDate(start, { month: "short", day: "numeric" });
  return days <= 7 ? fmtDate(start, { weekday: "short" }) : fmtDate(start, { day: "numeric" });
}

/** Stacked bars per day, week or month: done in ink at the bottom, then missed in the accent, then excused. */
function Bars({ s }: { s: DynamicStats }) {
  const first = s.buckets.findIndex((b) => b.done + b.missed + b.excused > 0);
  const buckets = s.buckets.slice(s.bucket === "day" ? 0 : Math.max(0, first));
  const max = Math.max(1, ...buckets.map((b) => b.done + b.missed + b.excused));
  const every = buckets.length > 16 ? 5 : buckets.length > 8 ? 2 : 1;
  const unit = s.bucket === "day" ? "day" : s.bucket === "week" ? "week of" : "";
  return (
    <div>
      <div className="flex h-32 items-end gap-[3px] border-b border-outline-variant" role="img" aria-label={`Done and missed by ${s.bucket}`}>
        {buckets.map((b) => {
          const total = b.done + b.missed + b.excused;
          return (
            <div
              key={b.start}
              className="flex h-full min-w-0 flex-1 flex-col justify-end"
              title={`${unit} ${fmtDate(b.start, { month: "short", day: "numeric" })}: ${b.done} done, ${b.missed} missed${b.excused ? `, ${b.excused} excused` : ""}`}
            >
              {total > 0 && (
                <div className="flex flex-col-reverse overflow-hidden" style={{ height: `${(total / max) * 100}%` }}>
                  <div className="bg-on-surface" style={{ flexGrow: b.done }} />
                  <div className="bg-primary" style={{ flexGrow: b.missed }} />
                  <div className="bg-outline-variant" style={{ flexGrow: b.excused }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-[3px] text-label-small text-on-surface-variant">
        {buckets.map((b, i) => (
          <span key={b.start} className="min-w-0 flex-1 overflow-visible text-center whitespace-nowrap">
            {i % every === 0 ? bucketLabel(b.start, s.bucket, s.days) : ""}
          </span>
        ))}
      </div>
      <p className="mt-3 flex gap-4 text-body-medium text-on-surface-variant">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 bg-on-surface" /> done
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 bg-primary" /> missed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 bg-outline-variant" /> excused
        </span>
      </p>
    </div>
  );
}

/** Done rate for each weekday as a thin ink bar, with the day that slips most called out. */
function Weekdays({ days }: { days: Tally[] }) {
  const { me } = useRel();
  const order = me.user.weekStart === "mon" ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
  const worst = days.reduce((w, d, i) => (d.missed > (days[w]?.missed ?? 0) ? i : w), -1);
  return (
    <>
      <div className="grid grid-cols-7 gap-2">
        {order.map((i) => {
          const d = days[i]!;
          return (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className="flex h-16 w-full items-end justify-center border-b border-outline-variant">
                {d.rate !== null && <div className="w-2 bg-on-surface" style={{ height: `${Math.max(4, d.rate * 100)}%` }} />}
              </div>
              <span className={cx("text-label-medium", i === worst ? "text-primary" : "text-on-surface-variant")}>{WEEKDAYS[i]!.slice(0, 3)}</span>
              <span className="text-label-small text-on-surface-variant">{d.rate === null ? "–" : pct(d.rate)}</span>
            </div>
          );
        })}
      </div>
      {worst >= 0 && (
        <p className="mt-3 text-body-medium text-on-surface-variant">
          Most misses on {WEEKDAYS[worst]}s ({days[worst]!.missed}).
        </p>
      )}
    </>
  );
}

/** Each task as a line with an ink bar, lowest done rate first, so what's slipping is at the top. */
function Tasks({ tasks }: { tasks: DynamicStats["tasks"] }) {
  const navigate = useNavigate();
  const sorted = [...tasks].sort((a, b) => (a.rate ?? 2) - (b.rate ?? 2) || b.done + b.missed - (a.done + a.missed));
  return (
    <ul className="mt-2 divide-y divide-outline-variant border-b border-outline-variant">
      {sorted.map((t) => (
        <li key={t.taskId}>
          <button
            type="button"
            disabled={!t.active}
            onClick={() => navigate({ to: "/tasks/$taskId", params: { taskId: t.taskId } })}
            className="state-layer flex w-full flex-col gap-2.5 py-3.5 text-left disabled:cursor-default"
          >
            <div className="flex w-full items-baseline gap-3">
              <span className="min-w-0 flex-1 truncate text-body-large text-on-surface">
                {t.title}
                {!t.active && <span className="text-on-surface-variant"> · ended</span>}
              </span>
              <span className="shrink-0 text-body-medium text-on-surface-variant tabular-nums">
                {t.done} of {t.done + t.missed}
                {t.excused ? ` · ${t.excused} excused` : ""}
              </span>
            </div>
            <div className="h-1 w-full bg-outline-variant/60">
              {t.rate !== null && <div className="h-full bg-on-surface" style={{ width: `${t.rate * 100}%` }} />}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
