import type { CalendarEvent, Relationship } from "../api/types";

/** Tailwind classes for a plan's colour, written out in full so Tailwind finds them. */
export type PlanTone = { bg: string; text: string; dot: string };

const BOTH: PlanTone = { bg: "bg-tertiary-container", text: "text-on-tertiary-container", dot: "bg-tertiary" };
const PEOPLE: PlanTone[] = [
  { bg: "bg-plan-1-container", text: "text-on-plan-1-container", dot: "bg-plan-1" },
  { bg: "bg-plan-2-container", text: "text-on-plan-2-container", dot: "bg-plan-2" },
  { bg: "bg-plan-3-container", text: "text-on-plan-3-container", dot: "bg-plan-3" },
  { bg: "bg-plan-4-container", text: "text-on-plan-4-container", dot: "bg-plan-4" },
];

const ROLE_ORDER = { dominant: 0, switch: 1, submissive: 2 } as const;

/** Members in a fixed order (Dominant first), so each person's plans are the same colour for everyone. */
export function planPeople(rel: Relationship) {
  return [...rel.members].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);
}

/** Plans for both share the tertiary colour; a "Just me" plan takes its author's colour. */
export function planTone(e: Pick<CalendarEvent, "authorId" | "withPartner">, rel: Relationship): PlanTone {
  if (e.withPartner) return BOTH;
  const i = planPeople(rel).findIndex((m) => m.userId === e.authorId);
  return i < 0 ? BOTH : PEOPLE[i % PEOPLE.length]!;
}

/** The key under the calendar: each person, then "Both of you". */
export function planLegend(rel: Relationship, myId: string): { label: string; tone: PlanTone }[] {
  const people = planPeople(rel);
  if (people.length < 2) return [];
  return [...people.map((m, i) => ({ label: m.userId === myId ? "You" : m.displayName, tone: PEOPLE[i % PEOPLE.length]! })), { label: "Both", tone: BOTH }];
}
