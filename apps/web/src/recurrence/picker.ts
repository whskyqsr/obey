import {
  type PlainDate,
  type RecurrenceRule,
  type Schedule,
  type Weekday,
  WEEKDAYS,
  addDays,
  describe,
  nextAfterCompletion,
  occurrences,
  parseDate,
  toDayNumber,
  validateSchedule,
  weekdayOf,
} from "@obey/recurrence";

/** What the recurrence picker edits. Converted to and from the stored {@link Schedule}. */
/** No "years": every 12 months from the start date gives the same dates, so the picker offers months only. */
export type RepeatKind = "once" | "days" | "weeks" | "months" | "cycle";
export type MonthlyMode = "day" | "nth" | "last";
export type EndMode = "never" | "count" | "until";

export interface PickerState {
  kind: RepeatKind;
  start: PlainDate;
  interval: number;
  weekdays: Weekday[];
  monthlyMode: MonthlyMode;
  monthDay: number;
  nth: number; // 1..5 or -1
  nthWeekday: Weekday;
  cycleOn: number;
  cycleOff: number;
  afterCompletion: boolean;
  end: EndMode;
  count: number;
  until: PlainDate;
}

/** Kinds that support "repeat after completion" (the engine only anchors interval rules). */
export const COMPLETION_KINDS: RepeatKind[] = ["days", "weeks", "months"];

export function defaultPicker(start: PlainDate): PickerState {
  const day = toDayNumber(start);
  const { day: dom } = parseDate(start);
  return {
    kind: "once",
    start,
    interval: 1,
    weekdays: [weekdayOf(day)],
    monthlyMode: "day",
    monthDay: dom,
    nth: Math.min(Math.ceil(dom / 7), 4),
    nthWeekday: weekdayOf(day),
    cycleOn: 3,
    cycleOff: 4,
    afterCompletion: false,
    end: "never",
    count: 10,
    until: addDays(start, 90),
  };
}

const sortWeekdays = (days: Weekday[]) => [...new Set(days)].sort((a, b) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b));

/** Coerces a possibly empty/NaN number input to an integer >= min. */
const int = (v: number, min: number, max = Infinity) => Math.min(max, Math.max(min, Number.isFinite(v) ? Math.floor(v) : min));

export function toSchedule(s: PickerState): Schedule {
  if (s.kind === "once") return { start: s.start };
  const interval = int(s.interval, 1);
  const anchored = s.afterCompletion && COMPLETION_KINDS.includes(s.kind);
  let rule: RecurrenceRule;
  switch (s.kind) {
    case "days":
      rule = { freq: "daily", interval };
      break;
    case "weeks":
      rule = { freq: "weekly", interval };
      if (!anchored && s.weekdays.length) rule.byWeekday = sortWeekdays(s.weekdays);
      break;
    case "months":
      rule = { freq: "monthly", interval };
      if (!anchored) {
        if (s.monthlyMode === "day") rule.byMonthDay = [int(s.monthDay, 1, 31)];
        else if (s.monthlyMode === "last") rule.byMonthDay = [-1];
        else {
          rule.byWeekday = [s.nthWeekday];
          rule.nth = s.nth;
        }
      }
      break;
    case "cycle": {
      const on = int(s.cycleOn, 1);
      const off = int(s.cycleOff, 0);
      rule = { freq: "cycle", cycleLength: on + off, cycleDays: Array.from({ length: on }, (_, i) => i) };
      break;
    }
  }
  if (s.end === "count") rule.count = int(s.count, 1);
  if (s.end === "until") rule.until = s.until;
  const schedule: Schedule = { start: s.start, rule };
  if (anchored) schedule.anchor = "completion";
  return schedule;
}

/** Best-effort inverse of {@link toSchedule}, for editing an existing task. */
export function fromSchedule(schedule: Schedule): PickerState {
  const s = defaultPicker(schedule.start);
  const rule = schedule.rule;
  if (!rule) return s;
  s.interval = rule.interval ?? 1;
  s.afterCompletion = schedule.anchor === "completion";
  if (rule.count !== undefined) {
    s.end = "count";
    s.count = rule.count;
  } else if (rule.until) {
    s.end = "until";
    s.until = rule.until;
  }
  switch (rule.freq) {
    case "daily":
      s.kind = "days";
      break;
    case "weekly":
      s.kind = "weeks";
      if (rule.byWeekday?.length) s.weekdays = [...rule.byWeekday];
      break;
    case "monthly":
      s.kind = "months";
      if (rule.byWeekday?.length && rule.nth !== undefined) {
        s.monthlyMode = "nth";
        s.nth = rule.nth;
        s.nthWeekday = rule.byWeekday[0]!;
      } else if (rule.byMonthDay?.[0] === -1) s.monthlyMode = "last";
      else if (rule.byMonthDay?.length) {
        s.monthlyMode = "day";
        s.monthDay = rule.byMonthDay[0]!;
      }
      break;
    case "yearly":
      // Shown as "every 12 months" on the start date's day, which repeats on the same dates.
      s.kind = "months";
      s.interval = (rule.interval ?? 1) * 12;
      s.monthlyMode = "day";
      break;
    case "cycle": {
      s.kind = "cycle";
      const len = rule.cycleLength ?? 7;
      const on = rule.cycleDays?.length ?? 1;
      s.cycleOn = on;
      s.cycleOff = Math.max(0, len - on);
      break;
    }
  }
  return s;
}

export interface Preview {
  summary: string;
  errors: string[];
  /** Next dates on or after `from`. For completion-anchored schedules, assumes each is done on its due date. */
  dates: PlainDate[];
}

export function preview(schedule: Schedule, from: PlainDate, n = 5): Preview {
  const errors = validateSchedule(schedule);
  if (errors.length) return { summary: "", errors, dates: [] };
  const summary = describe(schedule);
  const dates: PlainDate[] = [];
  const fromDay = toDayNumber(from);
  if (schedule.anchor === "completion") {
    let d: PlainDate | null = schedule.start;
    let i = 1;
    while (d && dates.length < n) {
      if (toDayNumber(d) >= fromDay) dates.push(d);
      d = nextAfterCompletion(schedule, d, i++);
      if (i > 5000) break;
    }
  } else {
    for (const d of occurrences(schedule)) {
      if (toDayNumber(d) < fromDay) continue;
      dates.push(d);
      if (dates.length >= n) break;
    }
  }
  return { summary, errors, dates };
}
