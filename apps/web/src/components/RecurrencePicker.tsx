import { useMemo } from "react";
import { WEEKDAYS, type Weekday } from "@obey/recurrence";
import { COMPLETION_KINDS, type PickerState, type RepeatKind, preview, toSchedule } from "../recurrence/picker";
import { useMe } from "../api/hooks";
import { fmtDate, today } from "../lib/dates";
import { Chip, Select, Switch, TextField, cx } from "./ui";

const DAY_LABEL: Record<Weekday, string> = { MO: "M", TU: "T", WE: "W", TH: "T", FR: "F", SA: "S", SU: "S" };
const DAY_NAME: Record<Weekday, string> = {
  MO: "Monday",
  TU: "Tuesday",
  WE: "Wednesday",
  TH: "Thursday",
  FR: "Friday",
  SA: "Saturday",
  SU: "Sunday",
};
/** The week as the person's calendar shows it: Sunday first unless they chose Monday. */
const weekdaysFrom = (weekStart: "sun" | "mon"): Weekday[] => (weekStart === "mon" ? [...WEEKDAYS] : ["SU", ...WEEKDAYS.filter((d) => d !== "SU")]);
const UNIT: Partial<Record<RepeatKind, string>> = { days: "day", weeks: "week", months: "month" };

function NumberField({
  label,
  value,
  onChange,
  min = 1,
  max = 365,
  suffix,
}: {
  label: string;
  value: number;
  onChange(n: number): void;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  return (
    <TextField
      label={label}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={Number.isFinite(value) ? value : ""}
      onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))}
      help={suffix}
    />
  );
}

type Mode = "once" | "daily" | "weeks" | "everyN" | "months" | "cycle";
const MODES: { value: Mode; label: string }[] = [
  { value: "once", label: "Once" },
  { value: "daily", label: "Daily" },
  { value: "weeks", label: "Weekly" },
  { value: "everyN", label: "Every N days" },
  { value: "months", label: "Monthly" },
  { value: "cycle", label: "On / off cycle" },
];
const modeOf = (s: PickerState): Mode => (s.kind === "days" ? (s.interval === 1 ? "daily" : "everyN") : s.kind);

const ENDS: { value: PickerState["end"]; label: string }[] = [
  { value: "never", label: "Never" },
  { value: "until", label: "On a date" },
  { value: "count", label: "After N times" },
];

/** "How often" (mockup 54): pills for the kind, the few fields that kind needs, and the next dates as one line. */
export function RecurrencePicker({ value, onChange }: { value: PickerState; onChange(next: PickerState): void }) {
  const set = (patch: Partial<PickerState>) => onChange({ ...value, ...patch });
  const s = value;
  const days = weekdaysFrom(useMe().data?.user.weekStart ?? "sun");
  const result = useMemo(() => preview(toSchedule(s), s.start > today() ? s.start : today(), 3), [s]);
  const anchored = s.afterCompletion && COMPLETION_KINDS.includes(s.kind);
  const unit = UNIT[s.kind];
  const mode = modeOf(s);
  const pick = (m: Mode) =>
    set(
      m === "daily"
        ? { kind: "days", interval: 1 }
        : m === "everyN"
          ? { kind: "days", interval: s.kind === "days" && s.interval > 1 ? s.interval : 2 }
          : { kind: m, interval: m === s.kind ? s.interval : 1 },
    );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        {MODES.map((k) => (
          <Chip key={k.value} plain selected={mode === k.value} onClick={() => pick(k.value)}>
            {k.label}
          </Chip>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <TextField
          label={s.kind === "once" ? "Date" : "Starts"}
          type="date"
          value={s.start}
          onChange={(e) => e.target.value && set({ start: e.target.value })}
        />
        {unit && mode !== "daily" && (
          <NumberField
            label={`Every how many ${unit}s`}
            value={s.interval}
            onChange={(n) => set({ interval: n })}
            max={unit === "day" ? 365 : unit === "month" ? 120 : 52}
          />
        )}
        {s.kind === "cycle" && (
          <>
            <NumberField label="Days on" value={s.cycleOn} onChange={(n) => set({ cycleOn: n })} max={60} />
            <NumberField label="Days off" value={s.cycleOff} onChange={(n) => set({ cycleOff: n })} min={0} max={60} />
          </>
        )}
      </div>

      {s.kind === "weeks" && !anchored && (
        <div>
          <div className="mb-2 text-body-small text-on-surface-variant">On</div>
          <div className="flex gap-1.5">
            {days.map((d) => {
              const on = s.weekdays.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  aria-label={DAY_NAME[d]}
                  title={DAY_NAME[d]}
                  onClick={() => set({ weekdays: on ? s.weekdays.filter((w) => w !== d) : [...s.weekdays, d] })}
                  className={cx(
                    "state-layer size-10 rounded-full border text-label-large",
                    on ? "border-on-surface bg-on-surface text-surface" : "border-outline-variant text-on-surface-variant",
                  )}
                >
                  {DAY_LABEL[d]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {s.kind === "months" && !anchored && (
        <div className="flex flex-col gap-4">
          <div>
            <div className="mb-2 text-body-small text-on-surface-variant">Monthly on</div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["day", "Day of month"],
                  ["nth", "Nth weekday"],
                  ["last", "Last day"],
                ] as const
              ).map(([v, label]) => (
                <Chip key={v} plain selected={s.monthlyMode === v} onClick={() => set({ monthlyMode: v })}>
                  {label}
                </Chip>
              ))}
            </div>
          </div>
          {s.monthlyMode === "day" && (
            <NumberField label="Day of month" value={s.monthDay} onChange={(n) => set({ monthDay: n })} max={31} suffix="Short months use their last day" />
          )}
          {s.monthlyMode === "nth" && (
            <div className="grid grid-cols-2 gap-4">
              <Select label="Which" value={s.nth} onChange={(e) => set({ nth: Number(e.target.value) })}>
                <option value={1}>First</option>
                <option value={2}>Second</option>
                <option value={3}>Third</option>
                <option value={4}>Fourth</option>
                <option value={5}>Fifth</option>
                <option value={-1}>Last</option>
              </Select>
              <Select label="Weekday" value={s.nthWeekday} onChange={(e) => set({ nthWeekday: e.target.value as Weekday })}>
                {days.map((d) => (
                  <option key={d} value={d}>
                    {DAY_NAME[d]}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>
      )}

      {COMPLETION_KINDS.includes(s.kind) && (
        <div className="border-b border-outline-variant">
          <Switch
            checked={s.afterCompletion}
            onChange={(v) => set({ afterCompletion: v })}
            label="Count from when it's done"
            help={`The next one is due ${s.interval || "N"} ${unit}${s.interval === 1 ? "" : "s"} after finishing`}
          />
        </div>
      )}

      {s.kind !== "once" && (
        <div className="flex flex-col gap-3">
          <div>
            <div className="mb-2 text-body-small text-on-surface-variant">Ends</div>
            <div className="flex flex-wrap gap-2">
              {ENDS.map((e) => (
                <Chip key={e.value} plain selected={s.end === e.value} onClick={() => set({ end: e.value })}>
                  {e.label}
                </Chip>
              ))}
            </div>
          </div>
          {s.end === "count" && <NumberField label="Times" value={s.count} onChange={(n) => set({ count: n })} max={1000} />}
          {s.end === "until" && (
            <TextField label="Last date" type="date" value={s.until} onChange={(e) => e.target.value && set({ until: e.target.value })} className="w-44" />
          )}
        </div>
      )}

      {result.errors.length ? (
        <ul className="text-body-medium text-error">
          {result.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : (
        <p className="text-body-medium text-on-surface-variant">
          {result.dates.length
            ? `Next: ${result.dates.map((d) => fmtDate(d, { weekday: "short", month: "short", day: "numeric", year: d.slice(0, 4) === today().slice(0, 4) ? undefined : "numeric" }).replace(",", "")).join(" · ")}`
            : "No upcoming dates."}
        </p>
      )}
    </div>
  );
}
