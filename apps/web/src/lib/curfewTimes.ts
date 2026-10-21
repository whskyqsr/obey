/** Times for asking about, granting and moving around curfew. */

export const plusMinutes = (iso: string, minutes: number) => new Date(Date.parse(iso) + minutes * 60_000).toISOString();

/** "22:30" in local time. */
export function toHHMM(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** The first local hh:mm strictly after [fromIso] (11:00 PM after 10:00 PM is the same night, 1:00 AM the next morning). */
export function timeAfter(fromIso: string, hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  const d = new Date(fromIso);
  const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m);
  if (at.getTime() <= d.getTime()) at.setDate(at.getDate() + 1);
  return at.toISOString();
}

/** "+1 hour", "+30 min", "+1 h 30 min". */
export function plusLabel(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `+${m} min`;
  return `+${h} ${h === 1 ? "hour" : "hours"}${m ? ` ${m} min` : ""}`;
}
