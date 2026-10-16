import { describe as group, expect, it } from "vitest";
import {
  type Schedule,
  addMonths,
  describe,
  nextAfterCompletion,
  nextOccurrence,
  occurrencesBetween,
  splitSeries,
  validateSchedule,
  weekdayOf,
  toDayNumber,
} from "../src/index.js";

const take = (s: Schedule, to = "2027-12-31") => occurrencesBetween(s, s.start, to);

group("date helpers", () => {
  it("knows weekdays", () => {
    expect(weekdayOf(toDayNumber("2026-10-16"))).toBe("FR");
    expect(weekdayOf(toDayNumber("1969-12-29"))).toBe("MO");
  });
  it("clamps month addition", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
  });
});

group("daily", () => {
  it("repeats every N days regardless of weekday", () => {
    const s: Schedule = { start: "2026-10-16", rule: { freq: "daily", interval: 3 } };
    expect(take(s, "2026-10-31")).toEqual(["2026-10-16", "2026-10-19", "2026-10-22", "2026-10-25", "2026-10-28", "2026-10-31"]);
  });
  it("honours count and until", () => {
    expect(take({ start: "2026-10-16", rule: { freq: "daily", count: 3 } })).toEqual(["2026-10-16", "2026-10-17", "2026-10-18"]);
    expect(take({ start: "2026-10-16", rule: { freq: "daily", interval: 2, until: "2026-10-21" } })).toEqual([
      "2026-10-16",
      "2026-10-18",
      "2026-10-20",
    ]);
  });
  it("one-off schedules yield their start only", () => {
    expect(take({ start: "2026-10-16" })).toEqual(["2026-10-16"]);
  });
});

group("weekly", () => {
  it("defaults to the start weekday", () => {
    expect(take({ start: "2026-10-16", rule: { freq: "weekly" } }, "2026-11-06")).toEqual([
      "2026-10-16",
      "2026-10-23",
      "2026-10-30",
      "2026-11-06",
    ]);
  });
  it("every other week on several days, skipping days before start", () => {
    // Start Wed 2026-10-14; week of start contains Mon 10-12 (before start, skipped).
    const s: Schedule = { start: "2026-10-14", rule: { freq: "weekly", interval: 2, byWeekday: ["MO", "TH"] } };
    expect(take(s, "2026-11-12")).toEqual(["2026-10-15", "2026-10-26", "2026-10-29", "2026-11-09", "2026-11-12"]);
  });
});

group("monthly", () => {
  it("clamps the 31st to short months", () => {
    expect(take({ start: "2026-01-31", rule: { freq: "monthly" } }, "2026-04-30")).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });
  it("supports last day and multiple days", () => {
    const s: Schedule = { start: "2026-02-01", rule: { freq: "monthly", byMonthDay: [1, 15, -1] } };
    expect(take(s, "2026-03-15")).toEqual(["2026-02-01", "2026-02-15", "2026-02-28", "2026-03-01", "2026-03-15"]);
  });
  it("supports nth weekday", () => {
    const second = { start: "2026-10-01", rule: { freq: "monthly", byWeekday: ["TU"], nth: 2 } } as Schedule;
    expect(take(second, "2027-01-31")).toEqual(["2026-10-13", "2026-11-10", "2026-12-08", "2027-01-12"]);
    const last = { start: "2026-10-01", rule: { freq: "monthly", byWeekday: ["FR"], nth: -1 } } as Schedule;
    expect(take(last, "2026-12-31")).toEqual(["2026-10-30", "2026-11-27", "2026-12-25"]);
  });
  it("respects interval", () => {
    expect(take({ start: "2026-10-05", rule: { freq: "monthly", interval: 3 } }, "2027-07-31")).toEqual([
      "2026-10-05",
      "2027-01-05",
      "2027-04-05",
      "2027-07-05",
    ]);
  });
});

group("yearly", () => {
  it("clamps Feb 29 in non-leap years", () => {
    expect(take({ start: "2028-02-29", rule: { freq: "yearly" } }, "2030-12-31")).toEqual(["2028-02-29", "2029-02-28", "2030-02-28"]);
  });
});

group("cycle", () => {
  it("expresses on/off patterns such as 3 on, 4 off", () => {
    const s: Schedule = { start: "2026-10-16", rule: { freq: "cycle", cycleLength: 7, cycleDays: [0, 1, 2] } };
    expect(take(s, "2026-10-30")).toEqual(["2026-10-16", "2026-10-17", "2026-10-18", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-30"]);
  });
});

group("nextOccurrence", () => {
  it("finds the next date strictly after a date, or null", () => {
    const s: Schedule = { start: "2026-10-16", rule: { freq: "daily", interval: 3, count: 3 } };
    expect(nextOccurrence(s, "2026-10-16")).toBe("2026-10-19");
    expect(nextOccurrence(s, "2026-10-15")).toBe("2026-10-16");
    expect(nextOccurrence(s, "2026-10-22")).toBeNull();
  });
  it("returns null for rules that never match", () => {
    const s: Schedule = { start: "2026-04-01", rule: { freq: "monthly", byWeekday: ["MO"], nth: 5, until: "2026-04-30" } };
    expect(nextOccurrence(s, "2026-04-01")).toBeNull();
  });
});

group("completion anchoring", () => {
  const s: Schedule = { start: "2026-10-16", anchor: "completion", rule: { freq: "daily", interval: 3 } };
  it("counts from the completion date, so a late completion pushes the next one", () => {
    expect(nextAfterCompletion(s, "2026-10-16")).toBe("2026-10-19");
    expect(nextAfterCompletion(s, "2026-10-18")).toBe("2026-10-21");
  });
  it("only fixes the first occurrence", () => {
    expect(take(s)).toEqual(["2026-10-16"]);
  });
  it("stops at count and until", () => {
    expect(nextAfterCompletion({ ...s, rule: { ...s.rule!, count: 2 } }, "2026-10-16", 2)).toBeNull();
    expect(nextAfterCompletion({ ...s, rule: { ...s.rule!, until: "2026-10-20" } }, "2026-10-18")).toBeNull();
  });
  it("supports monthly intervals", () => {
    const m: Schedule = { start: "2026-01-31", anchor: "completion", rule: { freq: "monthly" } };
    expect(nextAfterCompletion(m, "2026-01-31")).toBe("2026-02-28");
  });
  it("falls back to the calendar for calendar-anchored schedules", () => {
    expect(nextAfterCompletion({ start: "2026-10-16", rule: { freq: "daily", interval: 3 } }, "2026-10-17")).toBe("2026-10-19");
  });
});

group("splitSeries", () => {
  it("moves this and following occurrences", () => {
    const s: Schedule = { start: "2026-10-01", rule: { freq: "daily", interval: 3, count: 6 } };
    const { before, after } = splitSeries(s, "2026-10-07", "2026-10-08");
    expect(take(before!)).toEqual(["2026-10-01", "2026-10-04"]);
    expect(take(after)).toEqual(["2026-10-08", "2026-10-11", "2026-10-14", "2026-10-17"]);
  });
  it("shifts explicit weekdays", () => {
    const s: Schedule = { start: "2026-10-13", rule: { freq: "weekly", byWeekday: ["TU", "FR"] } };
    const { after } = splitSeries(s, "2026-10-20", "2026-10-22");
    expect(after.rule!.byWeekday).toEqual(["TH", "SU"]);
    expect(take(after, "2026-10-29")).toEqual(["2026-10-22", "2026-10-25", "2026-10-29"]);
  });
  it("has no before-part when splitting at the first occurrence", () => {
    const s: Schedule = { start: "2026-10-01", rule: { freq: "daily" } };
    expect(splitSeries(s, "2026-10-01", "2026-10-02").before).toBeNull();
  });
});

group("validation", () => {
  it("accepts good schedules", () => {
    expect(validateSchedule({ start: "2026-10-16", rule: { freq: "weekly", byWeekday: ["MO"] } })).toEqual([]);
  });
  it("rejects bad ones", () => {
    expect(validateSchedule({ start: "2026-02-30" })).not.toEqual([]);
    expect(validateSchedule({ start: "2026-10-16", rule: { freq: "daily", interval: 0 } })).not.toEqual([]);
    expect(validateSchedule({ start: "2026-10-16", rule: { freq: "cycle", cycleLength: 3, cycleDays: [3] } })).not.toEqual([]);
    expect(validateSchedule({ start: "2026-10-16", rule: { freq: "monthly", byWeekday: ["MO"] } })).not.toEqual([]);
    expect(
      validateSchedule({ start: "2026-10-16", anchor: "completion", rule: { freq: "weekly", byWeekday: ["MO"] } }),
    ).not.toEqual([]);
    expect(() => take({ start: "2026-10-16", rule: { freq: "daily", interval: -1 } })).toThrow(RangeError);
  });
});

group("describe", () => {
  it("summarises rules", () => {
    expect(describe({ start: "2026-10-16", rule: { freq: "daily", interval: 3 } })).toBe("Every 3 days");
    expect(describe({ start: "2026-10-16", rule: { freq: "weekly", interval: 2, byWeekday: ["MO", "TH"] } })).toBe(
      "Every 2 weeks on Mon, Thu",
    );
    expect(describe({ start: "2026-10-16", rule: { freq: "monthly", byWeekday: ["TU"], nth: 2 } })).toBe("Monthly on the 2nd Tue");
    expect(describe({ start: "2026-10-16", rule: { freq: "monthly", byMonthDay: [-1] } })).toBe("Monthly on the last day");
    expect(describe({ start: "2026-10-16", rule: { freq: "cycle", cycleLength: 7, cycleDays: [0, 1, 2] } })).toBe("3 of every 7 days");
    expect(describe({ start: "2026-10-16", anchor: "completion", rule: { freq: "daily", interval: 3 } })).toBe(
      "Every 3 days after completion",
    );
  });
});
