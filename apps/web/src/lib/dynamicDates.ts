import { fmtDate } from "./dates";

const parse = (d: string) => {
  const [y, m, day] = d.split("-").map(Number) as [number, number, number];
  return { y, m, day };
};
const utc = (y: number, m: number, d: number) => Date.UTC(y, m - 1, Math.min(d, new Date(Date.UTC(y, m, 0)).getUTCDate()));
const dayNum = (date: string) => {
  const { y, m, day } = parse(date);
  return utc(y, m, day);
};

/** Whole years since [date] as of [on], and days until it next comes round (0 = today). Feb 29 falls on Feb 28 in other years. */
export function anniversary(date: string, on: string): { years: number; daysUntil: number } {
  const d = parse(date);
  const t = parse(on);
  const now = dayNum(on);
  let next = utc(t.y, d.m, d.day);
  if (next < now) next = utc(t.y + 1, d.m, d.day);
  const nextYear = new Date(next).getUTCFullYear();
  const years = nextYear - d.y - (next > now ? 1 : 0);
  return { years: Math.max(0, years), daysUntil: Math.round((next - now) / 86_400_000) };
}

/** "Mar 4, 2023 · 2 years · in 135 days", or "today" when it comes round. Future dates count down. */
export function describeDate(date: string, on: string): string {
  const when = fmtDate(date, { month: "short", day: "numeric", year: "numeric" });
  if (date > on) {
    const days = Math.round((dayNum(date) - dayNum(on)) / 86_400_000);
    return `${when} · in ${days} ${days === 1 ? "day" : "days"}`;
  }
  const { years, daysUntil } = anniversary(date, on);
  const age = years === 0 ? null : `${years} ${years === 1 ? "year" : "years"}`;
  const next = daysUntil === 0 ? (years ? "today 🎉" : "today") : daysUntil === 1 ? "tomorrow" : `next in ${daysUntil} days`;
  return [when, age, next].filter(Boolean).join(" · ");
}
