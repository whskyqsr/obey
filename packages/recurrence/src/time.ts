import { DateTime } from "luxon";
import type { PlainDate } from "./date.js";

/** "HH:mm" in the series' own timezone, or null for an all-day task. */
export type DueTime = string | null;

/**
 * The instant an occurrence is due. All-day tasks are due at the end of their local day.
 * Times that fall in a DST gap move forward (02:30 on a spring-forward night becomes 03:30).
 */
export function dueInstant(date: PlainDate, time: DueTime, zone: string): Date {
  const day = DateTime.fromISO(date, { zone });
  if (!day.isValid) throw new RangeError(`Invalid date or zone: ${date} ${zone}`);
  if (time === null) return day.endOf("day").toJSDate();
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!m) throw new RangeError(`Invalid time "${time}", expected HH:mm`);
  return day.set({ hour: Number(m[1]), minute: Number(m[2]) }).toJSDate();
}

/** The local calendar date of an instant in a zone, e.g. to turn a completion time into a PlainDate. */
export function localDate(instant: Date, zone: string): PlainDate {
  const dt = DateTime.fromJSDate(instant, { zone });
  if (!dt.isValid) throw new RangeError(`Invalid zone: ${zone}`);
  return dt.toISODate()!;
}

/**
 * "Delay 24 hours": pushes a due instant by wall-clock hours in the series' zone, so a task due
 * 21:00 is still due 21:00 the next day across a DST change rather than 20:00 or 22:00.
 */
export function delayDue(due: Date, hours: number, zone: string): Date {
  const dt = DateTime.fromJSDate(due, { zone });
  if (hours % 24 === 0) return dt.plus({ days: hours / 24 }).toJSDate();
  return dt.plus({ hours }).toJSDate();
}

/** The local wall-clock time of an instant as "HH:mm". */
export function localTime(instant: Date, zone: string): string {
  return DateTime.fromJSDate(instant, { zone }).toFormat("HH:mm");
}

/** Whether an instant is the end of its local day, i.e. how all-day tasks are due. */
export function isEndOfLocalDay(instant: Date, zone: string): boolean {
  const dt = DateTime.fromJSDate(instant, { zone });
  return dt.hour === 23 && dt.minute === 59 && dt.second === 59;
}

/** Moves an instant by whole days or months of local wall-clock time, so a plan at 19:00 stays at 19:00 across DST. */
export function shiftLocal(instant: Date, by: { days?: number; months?: number }, zone: string): Date {
  return DateTime.fromJSDate(instant, { zone }).plus({ days: by.days ?? 0, months: by.months ?? 0 }).toJSDate();
}

/**
 * Moves [instant] the way [from] was moved to [to], in local wall-clock terms: the same number of days, landing at
 * [to]'s time of day. Used to carry an edit of one repeating plan over to the ones after it.
 */
export function moveLike(instant: Date, from: Date, to: Date, zone: string): Date {
  const f = DateTime.fromJSDate(from, { zone }).startOf("day");
  const t = DateTime.fromJSDate(to, { zone });
  const days = Math.round(t.startOf("day").diff(f, "days").days);
  return DateTime.fromJSDate(instant, { zone })
    .plus({ days })
    .set({ hour: t.hour, minute: t.minute, second: t.second, millisecond: t.millisecond })
    .toJSDate();
}
