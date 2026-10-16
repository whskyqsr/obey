import {
  type PlainDate,
  type Weekday,
  WEEKDAYS,
  addDays,
  addMonths,
  daysInMonth,
  formatDate,
  parseDate,
  partsOf,
  toDayNumber,
  weekdayIndex,
  weekdayOf,
} from "./date.js";

export type Frequency = "daily" | "weekly" | "monthly" | "yearly" | "cycle";

/**
 * How a recurring task repeats. Stored as JSON on the task series.
 *
 * Deliberately close to RFC 5545 RRULE so it can be exported, with two extensions
 * RRULE cannot express cleanly: `cycle` (on/off patterns such as "3 days on, 4 off")
 * and completion anchoring (see {@link Schedule.anchor}).
 */
export interface RecurrenceRule {
  freq: Frequency;
  /** Every N days/weeks/months/years. Defaults to 1. Ignored for `cycle`. */
  interval?: number;
  /** weekly: days of the week (defaults to the start date's weekday). monthly: used with `nth`. */
  byWeekday?: Weekday[];
  /**
   * monthly: days of the month, 1..31 or -1..-31 counting from the end (-1 = last day).
   * Days past the end of a short month clamp to its last day.
   */
  byMonthDay?: number[];
  /** monthly with `byWeekday`: 1..5 for "1st".."5th", -1 for "last" (e.g. 2nd Tuesday). */
  nth?: number;
  /** cycle: length of the repeating pattern in days. */
  cycleLength?: number;
  /** cycle: which offsets (0-based from the start date) within each cycle are "on". */
  cycleDays?: number[];
  /** Stop after this many occurrences. */
  count?: number;
  /** Last date an occurrence may fall on (inclusive). */
  until?: PlainDate;
}

export interface Schedule {
  /** The first date the task can occur on (RRULE's DTSTART). */
  start: PlainDate;
  /** Absent for a one-off task. */
  rule?: RecurrenceRule;
  /**
   * `calendar` (default): occurrences are fixed dates derived from `start`.
   * `completion`: the next occurrence is computed from when the previous one was
   * completed ("3 days after I last did it"), so delays naturally push later ones.
   */
  anchor?: "calendar" | "completion";
}

/** Scan limit: 200 years of days. Rules that never match within it are treated as exhausted. */
const MAX_SCAN_DAYS = 366 * 200;

export function validateSchedule(schedule: Schedule): string[] {
  const errors: string[] = [];
  try {
    parseDate(schedule.start);
  } catch {
    errors.push("start must be a valid YYYY-MM-DD date");
  }
  const rule = schedule.rule;
  if (!rule) return errors;

  const positiveInt = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 1;
  if (rule.interval !== undefined && !positiveInt(rule.interval)) errors.push("interval must be a positive integer");
  if (rule.count !== undefined && !positiveInt(rule.count)) errors.push("count must be a positive integer");
  if (rule.until !== undefined) {
    try {
      parseDate(rule.until);
    } catch {
      errors.push("until must be a valid YYYY-MM-DD date");
    }
  }
  if (rule.byWeekday?.some((d) => !WEEKDAYS.includes(d))) errors.push("byWeekday contains an unknown weekday");
  if (rule.byWeekday && rule.byWeekday.length === 0) errors.push("byWeekday must not be empty");

  switch (rule.freq) {
    case "daily":
    case "yearly":
      if (rule.byWeekday || rule.byMonthDay || rule.nth !== undefined)
        errors.push(`${rule.freq} rules do not take byWeekday, byMonthDay or nth`);
      break;
    case "weekly":
      if (rule.byMonthDay || rule.nth !== undefined) errors.push("weekly rules do not take byMonthDay or nth");
      break;
    case "monthly":
      if (rule.byMonthDay && (rule.byWeekday || rule.nth !== undefined))
        errors.push("monthly rules take either byMonthDay or byWeekday+nth, not both");
      if (rule.byMonthDay?.some((d) => !Number.isInteger(d) || d === 0 || d < -31 || d > 31))
        errors.push("byMonthDay values must be 1..31 or -1..-31");
      if (rule.byMonthDay && rule.byMonthDay.length === 0) errors.push("byMonthDay must not be empty");
      if ((rule.byWeekday === undefined) !== (rule.nth === undefined))
        errors.push("monthly byWeekday and nth must be given together");
      if (rule.nth !== undefined && !(Number.isInteger(rule.nth) && ((rule.nth >= 1 && rule.nth <= 5) || rule.nth === -1)))
        errors.push("nth must be 1..5 or -1");
      break;
    case "cycle": {
      const len = rule.cycleLength;
      if (!positiveInt(len)) errors.push("cycle rules need a positive integer cycleLength");
      else if (!rule.cycleDays?.length) errors.push("cycle rules need at least one cycleDays entry");
      else if (rule.cycleDays.some((d) => !Number.isInteger(d) || d < 0 || d >= len!))
        errors.push("cycleDays entries must be between 0 and cycleLength - 1");
      if (rule.interval !== undefined) errors.push("cycle rules do not take interval");
      break;
    }
    default:
      errors.push(`unknown freq "${(rule as RecurrenceRule).freq}"`);
  }

  if (schedule.anchor === "completion" && !["daily", "weekly", "monthly", "yearly"].includes(rule.freq))
    errors.push("completion-anchored schedules support daily, weekly, monthly and yearly rules only");
  if (schedule.anchor === "completion" && (rule.byWeekday || rule.byMonthDay))
    errors.push("completion-anchored schedules repeat by interval only, without byWeekday or byMonthDay");
  return errors;
}

function assertValid(schedule: Schedule): void {
  const errors = validateSchedule(schedule);
  if (errors.length) throw new RangeError(`Invalid schedule: ${errors.join("; ")}`);
}

/** Whether `day` (on or after start) matches the rule's pattern, ignoring count/until. */
function matches(rule: RecurrenceRule, startDay: number, day: number): boolean {
  const interval = rule.interval ?? 1;
  const start = partsOf(startDay);
  const d = partsOf(day);
  switch (rule.freq) {
    case "daily":
      return (day - startDay) % interval === 0;
    case "weekly": {
      const days = rule.byWeekday ?? [weekdayOf(startDay)];
      if (!days.includes(weekdayOf(day))) return false;
      const startWeekMonday = startDay - weekdayIndex(startDay);
      const week = Math.floor((day - startWeekMonday) / 7);
      return week % interval === 0;
    }
    case "monthly": {
      const monthDiff = (d.year - start.year) * 12 + (d.month - start.month);
      if (monthDiff % interval !== 0) return false;
      const dim = daysInMonth(d.year, d.month);
      if (rule.byWeekday && rule.nth !== undefined) {
        if (!rule.byWeekday.includes(weekdayOf(day))) return false;
        return rule.nth === -1 ? d.day + 7 > dim : Math.ceil(d.day / 7) === rule.nth;
      }
      const targets = rule.byMonthDay ?? [start.day];
      return targets.some((t) => {
        const resolved = t > 0 ? Math.min(t, dim) : Math.max(1, dim + 1 + t);
        return resolved === d.day;
      });
    }
    case "yearly": {
      const yearDiff = d.year - start.year;
      if (yearDiff % interval !== 0 || d.month !== start.month) return false;
      return d.day === Math.min(start.day, daysInMonth(d.year, d.month));
    }
    case "cycle":
      return rule.cycleDays!.includes((day - startDay) % rule.cycleLength!);
  }
}

/** Yields every occurrence date of a calendar-anchored schedule, in order, from its start. */
export function* occurrences(schedule: Schedule): Generator<PlainDate> {
  assertValid(schedule);
  const startDay = toDayNumber(schedule.start);
  const rule = schedule.rule;
  if (!rule) {
    yield schedule.start;
    return;
  }
  if (schedule.anchor === "completion") {
    // Only the first occurrence is fixed; later ones come from nextAfterCompletion.
    yield schedule.start;
    return;
  }
  const untilDay = rule.until ? toDayNumber(rule.until) : Infinity;
  const lastDay = Math.min(untilDay, startDay + MAX_SCAN_DAYS);
  let emitted = 0;
  for (let day = startDay; day <= lastDay; day++) {
    if (!matches(rule, startDay, day)) continue;
    yield formatDate(day);
    if (rule.count !== undefined && ++emitted >= rule.count) return;
  }
}

/** Occurrence dates within [from, to] inclusive. */
export function occurrencesBetween(schedule: Schedule, from: PlainDate, to: PlainDate): PlainDate[] {
  const fromDay = toDayNumber(from);
  const toDay = toDayNumber(to);
  const result: PlainDate[] = [];
  for (const date of occurrences(schedule)) {
    const day = toDayNumber(date);
    if (day > toDay) break;
    if (day >= fromDay) result.push(date);
  }
  return result;
}

/** The first occurrence strictly after `after`, or null when the series has ended. */
export function nextOccurrence(schedule: Schedule, after: PlainDate): PlainDate | null {
  const afterDay = toDayNumber(after);
  for (const date of occurrences(schedule)) {
    if (toDayNumber(date) > afterDay) return date;
  }
  return null;
}

/**
 * For completion-anchored schedules: the next due date given the local date the previous
 * occurrence was completed (or excused/missed, depending on the task's policy).
 * `occurrenceNumber` is how many occurrences already exist, used to honour `count`.
 */
export function nextAfterCompletion(
  schedule: Schedule,
  completedOn: PlainDate,
  occurrenceNumber = 1,
): PlainDate | null {
  assertValid(schedule);
  const rule = schedule.rule;
  if (!rule) return null;
  if (schedule.anchor !== "completion") return nextOccurrence(schedule, completedOn);
  if (rule.count !== undefined && occurrenceNumber >= rule.count) return null;
  const n = rule.interval ?? 1;
  let next: PlainDate;
  switch (rule.freq) {
    case "daily":
      next = addDays(completedOn, n);
      break;
    case "weekly":
      next = addDays(completedOn, 7 * n);
      break;
    case "monthly":
      next = addMonths(completedOn, n);
      break;
    case "yearly":
      next = addMonths(completedOn, 12 * n);
      break;
    default:
      return null;
  }
  if (rule.until && toDayNumber(next) > toDayNumber(rule.until)) return null;
  return next;
}

/**
 * "This and following" rescheduling: ends the series before `fromOccurrence` and starts a new
 * one on `newStart` carrying the rest of the pattern. Weekly rules with explicit weekdays shift
 * those weekdays by the same number of days, so moving Tue→Thu keeps a Tue/Fri task as Thu/Sun.
 * Returns `before: null` when the split is at the very first occurrence.
 */
export function splitSeries(
  schedule: Schedule,
  fromOccurrence: PlainDate,
  newStart: PlainDate,
): { before: Schedule | null; after: Schedule } {
  assertValid(schedule);
  const rule = schedule.rule;
  if (!rule) return { before: null, after: { ...schedule, start: newStart } };

  const fromDay = toDayNumber(fromOccurrence);
  let earlier = 0;
  for (const date of occurrences(schedule)) {
    if (toDayNumber(date) >= fromDay) break;
    earlier++;
  }

  const before: Schedule | null =
    earlier === 0
      ? null
      : {
          ...schedule,
          rule: { ...rule, until: addDays(fromOccurrence, -1), count: rule.count === undefined ? undefined : earlier },
        };
  stripUndefined(before?.rule);

  const shift = toDayNumber(newStart) - fromDay;
  const afterRule: RecurrenceRule = { ...rule };
  if (rule.count !== undefined) afterRule.count = rule.count - earlier;
  if (rule.freq === "weekly" && rule.byWeekday) {
    afterRule.byWeekday = rule.byWeekday.map((w) => WEEKDAYS[(((WEEKDAYS.indexOf(w) + shift) % 7) + 7) % 7]!);
  }
  return { before, after: { ...schedule, start: newStart, rule: afterRule } };
}

function stripUndefined(obj: object | undefined): void {
  if (!obj) return;
  for (const [k, v] of Object.entries(obj)) if (v === undefined) delete (obj as Record<string, unknown>)[k];
}

const DAY_NAMES: Record<Weekday, string> = {
  MO: "Mon",
  TU: "Tue",
  WE: "Wed",
  TH: "Thu",
  FR: "Fri",
  SA: "Sat",
  SU: "Sun",
};

function ordinal(n: number): string {
  if (n === -1) return "last";
  const suffix = n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th";
  return `${n}${suffix}`;
}

/** Short English summary for list rows, e.g. "Every 3 days" or "Every 2 weeks on Mon, Thu". */
export function describe(schedule: Schedule): string {
  const rule = schedule.rule;
  if (!rule) return "Once";
  const n = rule.interval ?? 1;
  const every = (unit: string) => (n === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`);
  let text: string;
  switch (rule.freq) {
    case "daily":
      text = n === 1 ? "Daily" : every("day");
      break;
    case "weekly":
      text = (n === 1 ? "Weekly" : every("week")) + (rule.byWeekday ? ` on ${rule.byWeekday.map((d) => DAY_NAMES[d]).join(", ")}` : "");
      break;
    case "monthly":
      text = n === 1 ? "Monthly" : every("month");
      if (rule.byWeekday && rule.nth !== undefined)
        text += ` on the ${ordinal(rule.nth)} ${rule.byWeekday.map((d) => DAY_NAMES[d]).join("/")}`;
      else if (rule.byMonthDay) text += ` on the ${rule.byMonthDay.map((d) => (d < 0 ? (d === -1 ? "last day" : `${ordinal(-d)}-to-last day`) : ordinal(d))).join(", ")}`;
      break;
    case "yearly":
      text = n === 1 ? "Yearly" : every("year");
      break;
    case "cycle": {
      const on = rule.cycleDays!.length;
      text = `${on} of every ${rule.cycleLength} days`;
      break;
    }
  }
  if (schedule.anchor === "completion") text += " after completion";
  if (rule.count !== undefined) text += `, ${rule.count} times`;
  if (rule.until) text += `, until ${rule.until}`;
  return text;
}
