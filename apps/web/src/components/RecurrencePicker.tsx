import { useMemo } from "react";
import { WEEKDAYS, type Weekday } from "@obey/recurrence";
import { COMPLETION_KINDS, type PickerState, type RepeatKind, preview, toSchedule } from "../recurrence/picker";
import { useMe } from "../api/hooks";
import { fmtDate, today } from "../lib/dates";
import { Chip, Icon, Select, SegmentedButtons, Switch, TextField, cx } from "./ui";

const KINDS: { value: RepeatKind; label: string }[] = [
  { value: "once", label: "Once" },
  { value: "days", label: "Every N days" },
  { value: "weeks", label: "Weekly" },
  { value: "months", label: "Monthly" },
  { value: "cycle", label: "On / off cycle" },
];

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
      className="w-32"
    />
  );
}

export function RecurrencePicker({ value, onChange }: { value: PickerState; onChange(next: PickerState): void }) {
  const set = (patch: Partial<PickerState>) => onChange({ ...value, ...patch });
  const s = value;
  const days = weekdaysFrom(useMe().data?.user.weekStart ?? "sun");
  const result = useMemo(() => preview(toSchedule(s), s.start > today() ? s.start : today(), 5), [s]);
  const anchored = s.afterCompletion && COMPLETION_KINDS.includes(s.kind);
  const unit = UNIT[s.kind];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <Chip key={k.value} selected={s.kind === k.value} onClick={() => set({ kind: k.value })}>
            {k.label}
          </Chip>
        ))}
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <TextField label={s.kind === "once" ? "Date" : "Starts"} type="date" value={s.start} onChange={(e) => e.target.value && set({ start: e.target.value })} className="w-44" />
        {unit && (
          <NumberField
            label={`Every N ${unit}s`}
            value={s.interval}
            onChange={(n) => set({ interval: n })}
            max={unit === "day" ? 365 : unit === "month" ? 120 : 52}
            suffix={s.interval === 1 ? `every ${unit}` : `every ${s.interval || "?"} ${unit}s`}
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
          <div className="mb-2 text-label-large text-on-surface-variant">On</div>
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
                  className={cx("state-layer size-10 rounded-full text-label-large", on ? "bg-primary text-on-primary" : "border border-outline-variant text-on-surface-variant")}
                >
                  {DAY_LABEL[d]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {s.kind === "months" && !anchored && (
        <div className="flex flex-col gap-3">
          <SegmentedButtons
            value={s.monthlyMode}
            onChange={(v) => set({ monthlyMode: v })}
            options={[
              { value: "day", label: "Day N" },
              { value: "nth", label: "Nth weekday" },
              { value: "last", label: "Last day" },
            ]}
            className="w-full max-w-md"
          />
          {s.monthlyMode === "day" && (
            <NumberField label="Day of month" value={s.monthDay} onChange={(n) => set({ monthDay: n })} max={31} suffix="Short months use their last day" />
          )}
          {s.monthlyMode === "nth" && (
            <div className="flex flex-wrap gap-4">
              <Select label="Which" value={s.nth} onChange={(e) => set({ nth: Number(e.target.value) })} className="w-36">
                <option value={1}>1st</option>
                <option value={2}>2nd</option>
                <option value={3}>3rd</option>
                <option value={4}>4th</option>
                <option value={5}>5th</option>
                <option value={-1}>Last</option>
              </Select>
              <Select label="Weekday" value={s.nthWeekday} onChange={(e) => set({ nthWeekday: e.target.value as Weekday })} className="w-44">
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
        <Switch
          checked={s.afterCompletion}
          onChange={(v) => set({ afterCompletion: v })}
          label="Count from when it's done"
          help={`On: the next one is due ${s.interval || "N"} ${unit}${s.interval === 1 ? "" : "s"} after the last is completed, so finishing late moves the rest. Off: it stays on a fixed schedule.`}
        />
      )}

      {s.kind !== "once" && (
        <div className="flex flex-wrap items-start gap-4">
          <Select label="Ends" value={s.end} onChange={(e) => set({ end: e.target.value as PickerState["end"] })} className="w-44">
            <option value="never">Never</option>
            <option value="count">After N times</option>
            <option value="until">On a date</option>
          </Select>
          {s.end === "count" && <NumberField label="Times" value={s.count} onChange={(n) => set({ count: n })} max={1000} />}
          {s.end === "until" && <TextField label="Last date" type="date" value={s.until} onChange={(e) => e.target.value && set({ until: e.target.value })} className="w-44" />}
        </div>
      )}

      <div className="rounded-md bg-secondary-container/50 p-4 text-on-secondary-container">
        {result.errors.length ? (
          <div className="flex gap-2 text-error">
            <Icon name="error" />
            <ul className="text-body-medium">
              {result.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 text-title-medium">
              <Icon name="event_repeat" />
              {result.summary}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {result.dates.map((d) => (
                <span key={d} className="rounded-sm bg-surface px-2 py-1 text-label-medium text-on-surface">
                  {fmtDate(d, { weekday: "short", month: "short", day: "numeric", year: d.slice(0, 4) === today().slice(0, 4) ? undefined : "numeric" })}
                </span>
              ))}
              {!result.dates.length && <span className="text-body-medium">No upcoming dates.</span>}
            </div>
            {anchored && <div className="mt-2 text-body-small opacity-80">Preview assumes each one is done on its due date.</div>}
          </>
        )}
      </div>
    </div>
  );
}
