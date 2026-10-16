// Calendar-date arithmetic on ISO "YYYY-MM-DD" strings.
// Recurrence is evaluated on local calendar dates (what the user sees on a calendar),
// never on instants, so DST shifts cannot move a task to a different day.

export type PlainDate = string;

export const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

const MS_PER_DAY = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface DateParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

export function parseDate(date: PlainDate): DateParts {
  const m = ISO_DATE.exec(date);
  if (!m) throw new RangeError(`Invalid date "${date}", expected YYYY-MM-DD`);
  const parts = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  if (formatDate(fromParts(parts)) !== date) throw new RangeError(`Invalid date "${date}"`);
  return parts;
}

function fromParts({ year, month, day }: DateParts): number {
  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

/** Days since 1970-01-01. */
export function toDayNumber(date: PlainDate): number {
  return fromParts(parseDate(date));
}

export function formatDate(dayNumber: number): PlainDate {
  return new Date(dayNumber * MS_PER_DAY).toISOString().slice(0, 10);
}

export function partsOf(dayNumber: number): DateParts {
  const d = new Date(dayNumber * MS_PER_DAY);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(dayNumber: number): number {
  // 1970-01-01 was a Thursday (index 3).
  return (((dayNumber + 3) % 7) + 7) % 7;
}

export function weekdayOf(dayNumber: number): Weekday {
  return WEEKDAYS[weekdayIndex(dayNumber)]!;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDays(date: PlainDate, days: number): PlainDate {
  return formatDate(toDayNumber(date) + days);
}

/** Adds months, clamping to the last day of the target month (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(date: PlainDate, months: number): PlainDate {
  const { year, month, day } = parseDate(date);
  const total = year * 12 + (month - 1) + months;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return formatDate(fromParts({ year: y, month: m, day: Math.min(day, daysInMonth(y, m)) }));
}
