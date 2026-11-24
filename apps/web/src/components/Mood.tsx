import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { MoodEntry } from "@obey/contracts";
import { useMoods } from "../api/hooks";
import { fmtDateTime } from "../lib/dates";
import { useRel } from "../lib/relationship";
import { Chip, SegmentedButtons, cx } from "./ui";

export const MOOD_LABELS = ["Awful", "Low", "Okay", "Good", "Great"];

/** Five pills to pick how you feel, 1 (awful) to 5 (great). The chosen one has the ink border. */
export function MoodPicker({ value, onChange }: { value: number | null; onChange(mood: number): void }) {
  return (
    <div role="radiogroup" aria-label="How do you feel?" className="grid max-w-md grid-cols-5 gap-2">
      {MOOD_LABELS.map((label, i) => {
        const on = value === i + 1;
        return (
          <button
            key={label}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(i + 1)}
            className={cx(
              "state-layer h-10 truncate rounded-full border px-1 text-body-large",
              on ? "border-on-surface text-on-surface" : "border-outline-variant text-on-surface-variant",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

const RANGES = [
  { value: "7", label: "Week" },
  { value: "30", label: "Month" },
  { value: "90", label: "3 months" },
  { value: "365", label: "Year" },
] as const;

/**
 * Mood over time: check-ins and journal moods for one person, as a line with a point per answer. Hidden until
 * there's something to show.
 */
/** `heading` shows above the card, and only when the card does. */
/** With `days` and `person` (as on Stats) the page's own range and person apply and the card shows no controls. */
export function MoodCard({ className, heading, days, person }: { className?: string; heading?: ReactNode; days?: number; person?: string }) {
  const { rel, me, memberName } = useRel();
  const [ownRange, setRange] = useState<string>("30");
  const range = days ? String(days) : ownRange;
  const moods = useMoods(rel.id, Number(range));
  const people = useMemo(() => [...new Set((moods.data ?? []).map((m) => m.userId))], [moods.data]);
  const sub = rel.members.find((m) => m.role === "submissive")?.userId;
  const [picked, setPicked] = useState<string | null>(null);
  const who = person ?? (picked && people.includes(picked) ? picked : people.includes(sub ?? "") ? sub! : (people[0] ?? me.user.id));
  const entries = (moods.data ?? []).filter((m) => m.userId === who);
  if (!moods.data || (!moods.data.length && range === "30") || (days && !entries.length)) return null;
  const avg = entries.length ? entries.reduce((s, m) => s + m.mood, 0) / entries.length : null;
  const sources = new Set(entries.map((e) => e.source));

  return (
    <>
      {heading}
      <div className={cx("mt-3 flex flex-col gap-4", className)}>
        {!days && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {people.length > 1 &&
                people.map((id) => (
                  <Chip key={id} plain selected={id === who} onClick={() => setPicked(id)}>
                    {id === me.user.id ? "You" : memberName(id)}
                  </Chip>
                ))}
            </div>
            <SegmentedButtons className="[&>*]:whitespace-nowrap" value={range} onChange={setRange} options={[...RANGES]} />
          </div>
        )}
        {avg !== null ? (
          <div className="flex items-center gap-3">
            <div>
              <div className="font-serif text-[30px] leading-9 text-on-surface">{MOOD_LABELS[Math.round(avg) - 1]} on average</div>
              <div className="text-body-medium text-on-surface-variant">
                {avg.toFixed(1)} out of 5 from {entries.length} {entries.length === 1 ? "answer" : "answers"}
                {who !== me.user.id ? ` by ${memberName(who)}` : ""}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-body-medium text-on-surface-variant">No moods in this stretch.</p>
        )}
        {entries.length > 0 && <MoodChart entries={entries} days={Number(range)} />}
        {sources.size > 1 && (
          <div className="flex gap-4 text-label-medium text-on-surface-variant">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-on-surface" /> Check-in
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full border-2 border-on-surface" /> Journal
            </span>
          </div>
        )}
      </div>
    </>
  );
}

const H = 160;
const PAD = { top: 10, bottom: 22, left: 4, right: 10 };

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e!.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function MoodChart({ entries, days }: { entries: MoodEntry[]; days: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const end = Date.now();
  const start = end - days * 86_400_000;
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = H - PAD.top - PAD.bottom;
  const x = (iso: string) => PAD.left + ((new Date(iso).getTime() - start) / (end - start)) * plotW;
  const y = (m: number) => PAD.top + ((5 - m) / 4) * plotH;
  const pts = entries.map((e) => ({ e, x: x(e.at), y: y(e.mood) }));
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const ticks = [start, start + (end - start) / 2, end].map((t, i) => ({
    x: PAD.left + (i / 2) * plotW,
    label: i === 2 ? "Today" : new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    anchor: (i === 0 ? "start" : i === 2 ? "end" : "middle") as "start" | "end" | "middle",
  }));
  const near = (clientX: number) => {
    const left = ref.current!.getBoundingClientRect().left;
    let best = 0;
    pts.forEach((p, i) => {
      if (Math.abs(p.x - (clientX - left)) < Math.abs(pts[best]!.x - (clientX - left))) best = i;
    });
    setHover(best);
  };
  const h = hover !== null ? pts[hover] : null;

  return (
    <div className="flex gap-1">
      <div className="flex shrink-0 flex-col justify-between text-on-surface-variant" style={{ height: plotH + 24, marginTop: PAD.top - 12 }} aria-hidden>
        {[...MOOD_LABELS].reverse().map((label) => (
          <span key={label} className="flex h-6 items-center text-label-small">
            {label}
          </span>
        ))}
      </div>
      <div ref={ref} className="relative min-w-0 flex-1">
        {width > 0 && (
          <svg
            width={width}
            height={H}
            className="block touch-none"
            role="img"
            aria-label={`Mood chart, ${entries.length} answers`}
            onPointerMove={(ev) => near(ev.clientX)}
            onPointerDown={(ev) => near(ev.clientX)}
            onPointerLeave={() => setHover(null)}
          >
            {[1, 2, 3, 4, 5].map((m) => (
              <line
                key={m}
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y(m)}
                y2={y(m)}
                className="stroke-outline-variant"
                strokeWidth={1}
                strokeDasharray={m === 3 ? undefined : "2 4"}
              />
            ))}
            {h && <line x1={h.x} x2={h.x} y1={PAD.top} y2={PAD.top + plotH} className="stroke-outline" strokeWidth={1} />}
            {pts.length > 1 && <path d={line} fill="none" className="stroke-on-surface" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />}
            {pts.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={i === hover ? 6 : 4.5}
                strokeWidth={2}
                className={p.e.source === "checkin" ? "fill-on-surface stroke-surface" : "fill-surface stroke-on-surface"}
              />
            ))}
            {ticks.map((t) => (
              <text key={t.label} x={t.x} y={H - 4} textAnchor={t.anchor} className="fill-on-surface-variant text-label-small">
                {t.label}
              </text>
            ))}
          </svg>
        )}
        {h && (
          <div
            className="pointer-events-none absolute z-10 w-max max-w-56 rounded-md bg-inverse-surface px-3 py-2 text-body-small text-inverse-on-surface shadow-md"
            style={h.x < width / 2 ? { left: h.x + 14, top: 0 } : { right: width - h.x + 14, top: 0 }}
          >
            <div className="text-label-large">{MOOD_LABELS[h.e.mood - 1]}</div>
            <div className="truncate">{h.e.title || (h.e.source === "journal" ? "Journal entry" : "Check-in")}</div>
            {h.e.note && <div className="line-clamp-2 opacity-80">{h.e.note}</div>}
            <div className="opacity-80">{fmtDateTime(h.e.at)}</div>
          </div>
        )}
      </div>
    </div>
  );
}
