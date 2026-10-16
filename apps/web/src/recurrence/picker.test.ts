import { describe, expect, it } from "vitest";
import { defaultPicker, fromSchedule, preview, toSchedule, type PickerState } from "./picker";

const base = (patch: Partial<PickerState>): PickerState => ({ ...defaultPicker("2026-10-16"), ...patch });

describe("toSchedule", () => {
  it("once has no rule", () => {
    expect(toSchedule(base({ kind: "once" }))).toEqual({ start: "2026-10-16" });
  });

  it("every N days", () => {
    expect(toSchedule(base({ kind: "days", interval: 3 }))).toEqual({
      start: "2026-10-16",
      rule: { freq: "daily", interval: 3 },
    });
  });

  it("every N weeks on chosen weekdays, sorted and de-duplicated", () => {
    expect(toSchedule(base({ kind: "weeks", interval: 2, weekdays: ["TH", "MO", "TH"] })).rule).toEqual({
      freq: "weekly",
      interval: 2,
      byWeekday: ["MO", "TH"],
    });
  });

  it("monthly on day N, nth weekday and last day", () => {
    expect(toSchedule(base({ kind: "months", monthlyMode: "day", monthDay: 31 })).rule).toEqual({
      freq: "monthly",
      interval: 1,
      byMonthDay: [31],
    });
    expect(toSchedule(base({ kind: "months", monthlyMode: "nth", nth: 2, nthWeekday: "TU" })).rule).toEqual({
      freq: "monthly",
      interval: 1,
      byWeekday: ["TU"],
      nth: 2,
    });
    expect(toSchedule(base({ kind: "months", monthlyMode: "last" })).rule?.byMonthDay).toEqual([-1]);
  });

  it("on-off cycle", () => {
    expect(toSchedule(base({ kind: "cycle", cycleOn: 3, cycleOff: 4 })).rule).toEqual({
      freq: "cycle",
      cycleLength: 7,
      cycleDays: [0, 1, 2],
    });
  });

  it("repeat after completion drops weekday/monthday constraints", () => {
    const s = toSchedule(base({ kind: "weeks", interval: 1, weekdays: ["MO"], afterCompletion: true }));
    expect(s).toEqual({ start: "2026-10-16", rule: { freq: "weekly", interval: 1 }, anchor: "completion" });
    // cycles cannot be completion-anchored, so the toggle is ignored
    expect(toSchedule(base({ kind: "cycle", afterCompletion: true })).anchor).toBeUndefined();
  });

  it("end conditions", () => {
    expect(toSchedule(base({ kind: "days", end: "count", count: 5 })).rule?.count).toBe(5);
    expect(toSchedule(base({ kind: "days", end: "until", until: "2026-12-31" })).rule?.until).toBe("2026-12-31");
  });

  it("round-trips through fromSchedule", () => {
    const states = [
      base({ kind: "days", interval: 3 }),
      base({ kind: "weeks", interval: 2, weekdays: ["MO", "TH"] }),
      base({ kind: "months", monthlyMode: "nth", nth: -1, nthWeekday: "FR" }),
      base({ kind: "months", monthlyMode: "last" }),
      base({ kind: "cycle", cycleOn: 2, cycleOff: 5 }),
      base({ kind: "days", interval: 2, afterCompletion: true, end: "count", count: 4 }),
    ];
    for (const s of states) expect(toSchedule(fromSchedule(toSchedule(s)))).toEqual(toSchedule(s));
  });
});

describe("preview", () => {
  it("describes and lists the next five dates", () => {
    const p = preview(toSchedule(base({ kind: "days", interval: 3 })), "2026-10-16");
    expect(p.summary).toBe("Every 3 days");
    expect(p.dates).toEqual(["2026-10-16", "2026-10-19", "2026-10-22", "2026-10-25", "2026-10-28"]);
  });

  it("skips dates before `from`", () => {
    const p = preview(toSchedule(base({ kind: "months", monthlyMode: "last" })), "2026-11-05", 3);
    expect(p.dates).toEqual(["2026-11-30", "2026-12-31", "2027-01-31"]);
  });

  it("projects completion-anchored schedules", () => {
    const p = preview(toSchedule(base({ kind: "days", interval: 2, afterCompletion: true })), "2026-10-16", 3);
    expect(p.summary).toBe("Every 2 days after completion");
    expect(p.dates).toEqual(["2026-10-16", "2026-10-18", "2026-10-20"]);
  });

  it("reports validation errors instead of throwing", () => {
    const p = preview({ start: "2026-10-16", rule: { freq: "cycle", cycleLength: 0, cycleDays: [] } }, "2026-10-16");
    expect(p.errors.length).toBeGreaterThan(0);
    expect(p.dates).toEqual([]);
  });
});
