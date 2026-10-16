import { type PlainDate, addDays, addMonths, parseDate, toDayNumber, weekdayIndex } from "@obey/recurrence";

export { addDays, addMonths };

const pad = (n: number) => String(n).padStart(2, "0");

/** Local calendar date of an instant, in the browser's zone. */
export function localDateOf(d: Date): PlainDate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function today(): PlainDate {
  return localDateOf(new Date());
}

export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/** Monday of the week containing `date`. */
export function startOfWeek(date: PlainDate): PlainDate {
  return addDays(date, -weekdayIndex(toDayNumber(date)));
}

export function startOfMonth(date: PlainDate): PlainDate {
  return date.slice(0, 8) + "01";
}

export function endOfMonth(date: PlainDate): PlainDate {
  return addDays(addMonths(startOfMonth(date), 1), -1);
}

export function daysBetween(from: PlainDate, to: PlainDate): PlainDate[] {
  const out: PlainDate[] = [];
  for (let d = from; toDayNumber(d) <= toDayNumber(to); d = addDays(d, 1)) out.push(d);
  return out;
}

/** 6x7 grid of dates covering the month, starting on Monday. */
export function monthGrid(date: PlainDate): PlainDate[] {
  const first = startOfWeek(startOfMonth(date));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

function asDate(date: PlainDate): Date {
  const { year, month, day } = parseDate(date);
  return new Date(year, month - 1, day);
}

export function fmtDate(date: PlainDate, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }) {
  return asDate(date).toLocaleDateString(undefined, opts);
}

export function fmtMonth(date: PlainDate) {
  return asDate(date).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/** All-day tasks are due at 23:59:59 local time. */
export function isAllDayDue(iso: string) {
  const d = new Date(iso);
  return d.getHours() === 23 && d.getMinutes() === 59 && d.getSeconds() === 59;
}

export function fmtTime(iso: string) {
  if (isAllDayDue(iso)) return "All day";
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function fmtDateTime(iso: string) {
  if (isAllDayDue(iso)) return `${new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}, all day`;
  return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Relative "in 3h" / "2d ago" style label. */
export function fmtRelative(iso: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60_000);
  const label = mins < 60 ? `${mins}m` : mins < 60 * 48 ? `${Math.round(mins / 60)}h` : `${Math.round(mins / 1440)}d`;
  return diff >= 0 ? `in ${label}` : `${label} ago`;
}

/** Value for <input type="datetime-local"> from an ISO instant. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  return `${localDateOf(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** ISO string with the browser's UTC offset from a datetime-local value. */
export function fromLocalInput(value: string): string {
  const d = new Date(value);
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  return `${value.length === 16 ? value + ":00" : value}${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
}
