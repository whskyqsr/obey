import { useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useStats } from "../api/hooks";
import type { DynamicStats, Tally } from "../api/types";
import { MoodCard } from "../components/Mood";
import { Chip, Empty, ErrorBox, Icon, Loading, PageHeader, SegmentedButtons, cx } from "../components/ui";
import { fmtDate } from "../lib/dates";
import { useRel } from "../lib/relationship";

const RANGES = [
  { value: "7", label: "Week", before: "the week before" },
  { value: "30", label: "Month", before: "the month before" },
  { value: "90", label: "3 months", before: "the 3 months before" },
  { value: "365", label: "Year", before: "the year before" },
] as const;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const pct = (rate: number) => `${Math.round(rate * 100)}%`;

/** How one person's tasks have gone: rate and trend, done and missed over time, weekdays, and each task. */
export function StatsPage() {
  const { rel, me, memberName } = useRel();
  const [range, setRange] = useState<string>("30");
  const sub = rel.members.find((m) => m.role === "submissive")?.userId;
  const [who, setWho] = useState<string>(sub ?? me.user.id);
  const stats = useStats(rel.id, Number(range), who);
  const name = who === me.user.id ? "Your" : `${memberName(who)}'s`;

  return (
    <>
      <PageHeader title="Stats" subtitle={`${name} tasks`} />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-10 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {rel.members.length > 1 &&
              rel.members.map((m) => (
                <Chip key={m.userId} selected={m.userId === who} onClick={() => setWho(m.userId)}>
                  {m.userId === me.user.id ? "You" : m.displayName}
                </Chip>
              ))}
          </div>
          <SegmentedButtons
            className="w-full sm:w-md [&>*]:px-2 [&>*]:whitespace-nowrap"
            value={range}
            onChange={setRange}
            options={RANGES.map(({ value, label }) => ({ value, label }))}
          />
        </div>
        {stats.isPending ? (
          <Loading />
        ) : stats.error ? (
          <ErrorBox error={stats.error} onRetry={() => stats.refetch()} />
        ) : stats.data.totals.done + stats.data.totals.missed + stats.data.totals.excused === 0 ? (
          <Empty icon="insights" title="Nothing finished in this stretch" body="Stats fill in as tasks are done or missed." />
        ) : (
          <Body s={stats.data} before={RANGES.find((r) => r.value === range)!.before} />
        )}
        {who === sub && <MoodCard heading={<h2 className="mt-2 text-title-medium text-on-surface">Mood</h2>} />}
      </div>
    </>
  );
}

/** `flush` lets rows run to the card's edges. */
function Card({ title, children, flush }: { title?: string; children: ReactNode; flush?: boolean }) {
  return (
    <section className={cx("flex flex-col gap-3 rounded-lg bg-surface-container-low", flush ? "pt-4 pb-2" : "p-4")}>
      {title && <h2 className={cx("text-title-medium text-on-surface", flush && "px-4")}>{title}</h2>}
      {children}
    </section>
  );
}

function Body({ s, before }: { s: DynamicStats; before: string }) {
  const t = s.totals;
  return (
    <>
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div>
            <div className="text-display-medium text-on-surface">{t.rate === null ? "–" : pct(t.rate)}</div>
            <div className="text-body-medium text-on-surface-variant">done of what was due</div>
            <Trend rate={t.rate} previous={s.previous.rate} before={before} />
          </div>
          <dl className="grid grid-cols-3 gap-2 text-center">
            <Count label="Done" value={t.done} dot="bg-primary" />
            <Count label="Missed" value={t.missed} dot="bg-outline" />
            <Count label="Excused" value={t.excused} dot="bg-outline-variant" />
          </dl>
        </div>
        {(t.done > 0 || t.moved > 0) && (
          <p className="text-body-medium text-on-surface-variant">
            {t.done > 0 && `${pct(t.onTime / t.done)} of done tasks were on time`}
            {t.done > 0 && t.moved > 0 && " · "}
            {t.moved > 0 && `${t.moved} ${t.moved === 1 ? "deadline" : "deadlines"} moved`}
          </p>
        )}
      </Card>
      <Card title="Over time">
        <Bars s={s} />
      </Card>
      <Card title="By weekday">
        <Weekdays days={s.weekdays} />
      </Card>
      <Card title="By task" flush>
        <Tasks tasks={s.tasks} />
      </Card>
    </>
  );
}

function Trend({ rate, previous, before }: { rate: number | null; previous: number | null; before: string }) {
  if (rate === null || previous === null) return null;
  const diff = Math.round((rate - previous) * 100);
  const up = diff > 0;
  return (
    <div className={cx("mt-1 flex items-center gap-1 text-label-large", diff === 0 ? "text-on-surface-variant" : up ? "text-primary" : "text-error")}>
      <Icon name={diff === 0 ? "trending_flat" : up ? "trending_up" : "trending_down"} size={20} />
      {diff === 0 ? `Same as ${before}` : `${up ? "Up" : "Down"} ${Math.abs(diff)} ${Math.abs(diff) === 1 ? "point" : "points"} on ${before}`}
    </div>
  );
}

function Count({ label, value, dot }: { label: string; value: number; dot: string }) {
  return (
    <div className="min-w-16 rounded-md bg-surface-container px-3 py-2">
      <dd className="text-title-large text-on-surface">{value}</dd>
      <dt className="flex items-center justify-center gap-1.5 text-label-medium text-on-surface-variant">
        <span className={cx("size-2 rounded-full", dot)} />
        {label}
      </dt>
    </div>
  );
}

function bucketLabel(start: string, bucket: DynamicStats["bucket"], days: number) {
  if (bucket === "month") return fmtDate(start, { month: "short" });
  if (bucket === "week") return fmtDate(start, { month: "short", day: "numeric" });
  return days <= 7 ? fmtDate(start, { weekday: "short" }) : fmtDate(start, { day: "numeric" });
}

/** Stacked bars per day, week or month: done at the bottom, then missed, then excused. Empty stretches before the first task are left off. */
function Bars({ s }: { s: DynamicStats }) {
  const first = s.buckets.findIndex((b) => b.done + b.missed + b.excused > 0);
  const buckets = s.buckets.slice(s.bucket === "day" ? 0 : Math.max(0, first));
  const max = Math.max(1, ...buckets.map((b) => b.done + b.missed + b.excused));
  const every = buckets.length > 16 ? 5 : buckets.length > 8 ? 2 : 1;
  const unit = s.bucket === "day" ? "day" : s.bucket === "week" ? "week of" : "";
  return (
    <div>
      <div className="flex h-40 items-end gap-[3px]" role="img" aria-label={`Done and missed by ${s.bucket}`}>
        {buckets.map((b) => {
          const total = b.done + b.missed + b.excused;
          return (
            <div
              key={b.start}
              className="flex h-full min-w-0 flex-1 flex-col justify-end"
              title={`${unit} ${fmtDate(b.start, { month: "short", day: "numeric" })}: ${b.done} done, ${b.missed} missed${b.excused ? `, ${b.excused} excused` : ""}`}
            >
              {total === 0 ? (
                <div className="h-0.5 rounded-full bg-outline-variant/60" />
              ) : (
                <div className="flex flex-col-reverse overflow-hidden rounded-t-sm" style={{ height: `${(total / max) * 100}%` }}>
                  <div className="bg-primary" style={{ flexGrow: b.done }} />
                  <div className="bg-outline" style={{ flexGrow: b.missed }} />
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
    </div>
  );
}

/** Done rate for each weekday, with the day that slips most called out. */
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
              <div className="relative flex h-20 w-full max-w-10 items-end overflow-hidden rounded-sm bg-surface-container">
                {d.rate !== null && <div className="w-full bg-primary" style={{ height: `${Math.max(4, d.rate * 100)}%` }} />}
              </div>
              <span className={cx("text-label-medium", i === worst ? "font-bold text-on-surface" : "text-on-surface-variant")}>{WEEKDAYS[i]!.slice(0, 3)}</span>
              <span className="text-label-small text-on-surface-variant">{d.rate === null ? "–" : pct(d.rate)}</span>
            </div>
          );
        })}
      </div>
      {worst >= 0 && (
        <p className="text-body-medium text-on-surface-variant">
          Most misses on {WEEKDAYS[worst]}s ({days[worst]!.missed}).
        </p>
      )}
    </>
  );
}

/** Each task, lowest done rate first, so what's slipping is at the top. */
function Tasks({ tasks }: { tasks: DynamicStats["tasks"] }) {
  const navigate = useNavigate();
  const sorted = [...tasks].sort((a, b) => (a.rate ?? 2) - (b.rate ?? 2) || b.done + b.missed - (a.done + a.missed));
  return (
    <ul>
      {sorted.map((t) => (
        <li key={t.taskId}>
          <button
            type="button"
            disabled={!t.active}
            onClick={() => navigate({ to: "/tasks/$taskId", params: { taskId: t.taskId } })}
            className="state-layer flex w-full items-center gap-4 px-4 py-3 text-left disabled:cursor-default"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-body-large text-on-surface">{t.title}</div>
              <div className="text-body-medium text-on-surface-variant">
                {t.done} of {t.done + t.missed} done{t.excused ? `, ${t.excused} excused` : ""}
                {!t.active && " · ended"}
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-container-highest">
                {t.rate !== null && <div className="h-full rounded-full bg-primary" style={{ width: `${t.rate * 100}%` }} />}
              </div>
            </div>
            <div className="w-14 shrink-0 text-right">
              <div className="text-title-medium text-on-surface">{t.rate === null ? "–" : pct(t.rate)}</div>
              {t.streak > 1 && (
                <div className="flex items-center justify-end gap-0.5 text-label-small text-on-surface-variant" title={`Streak of ${t.streak}`}>
                  <Icon name="local_fire_department" size={14} />
                  {t.streak}
                </div>
              )}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
