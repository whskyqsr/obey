import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { planLine } from "./PartnerColumn";

const plan = (startsAt: string, endsAt: string, allDay = false) =>
  ({ id: "p", relationshipId: "r", authorId: "a", title: "x", startsAt, endsAt, allDay, withPartner: false, noteMd: null }) as never;

describe("planLine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 24, 18, 0)); // Tue Nov 24, 6 PM local
  });
  afterEach(() => vi.useRealTimers());

  it("says when a plan under way ends, not the day it began", () => {
    expect(planLine(plan(new Date(2026, 10, 23).toISOString(), new Date(2026, 10, 28).toISOString(), true))).toBe("Until Fri");
    expect(planLine(plan(new Date(2026, 10, 23).toISOString(), new Date(2026, 10, 26).toISOString(), true))).toBe("Until tomorrow");
  });
  it("names days from now", () => {
    expect(planLine(plan(new Date(2026, 10, 25, 19).toISOString(), new Date(2026, 10, 25, 22).toISOString()))).toMatch(/^Tomorrow 7:00\sPM–10:00\sPM$/);
    expect(planLine(plan(new Date(2026, 10, 27).toISOString(), new Date(2026, 10, 29).toISOString(), true))).toBe("Fri–Sat");
    expect(planLine(plan(new Date(2026, 11, 3).toISOString(), new Date(2026, 11, 4).toISOString(), true))).toBe("Dec 3, all day");
  });
});
