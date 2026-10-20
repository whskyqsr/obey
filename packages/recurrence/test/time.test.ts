import { describe, expect, it } from "vitest";
import { delayDue, dueInstant, isEndOfLocalDay, localDate, localTime } from "../src/index.js";

const NY = "America/New_York";

describe("dueInstant", () => {
  it("resolves a local time in the series zone", () => {
    expect(dueInstant("2026-10-16", "21:00", NY).toISOString()).toBe("2026-10-17T01:00:00.000Z");
  });
  it("makes all-day tasks due at the end of the local day", () => {
    expect(dueInstant("2026-10-16", null, NY).toISOString()).toBe("2026-10-17T03:59:59.999Z");
  });
  it("moves times in a DST gap forward", () => {
    // 2027-03-14 02:30 does not exist in New York.
    expect(dueInstant("2027-03-14", "02:30", NY).toISOString()).toBe("2027-03-14T07:30:00.000Z");
  });
  it("rejects bad input", () => {
    expect(() => dueInstant("2026-10-16", "25:00", NY)).toThrow(RangeError);
    expect(() => dueInstant("2026-10-16", "21:00", "Not/AZone")).toThrow(RangeError);
  });
});

describe("delayDue", () => {
  it("keeps the wall-clock time across a DST change when delaying by whole days", () => {
    // DST ends 2026-11-01 in New York.
    const due = dueInstant("2026-10-31", "21:00", NY);
    expect(delayDue(due, 24, NY).toISOString()).toBe(dueInstant("2026-11-01", "21:00", NY).toISOString());
  });
  it("adds plain hours otherwise", () => {
    const due = dueInstant("2026-10-16", "21:00", NY);
    expect(delayDue(due, 2, NY).toISOString()).toBe("2026-10-17T03:00:00.000Z");
  });
});

describe("localDate", () => {
  it("uses the zone's calendar date", () => {
    expect(localDate(new Date("2026-10-17T02:00:00Z"), NY)).toBe("2026-10-16");
  });
});

describe("localTime and isEndOfLocalDay", () => {
  it("reads wall-clock values in the zone", () => {
    expect(localTime(dueInstant("2026-10-16", "21:05", NY), NY)).toBe("21:05");
    expect(isEndOfLocalDay(dueInstant("2026-10-16", null, NY), NY)).toBe(true);
    expect(isEndOfLocalDay(dueInstant("2026-10-16", "21:00", NY), NY)).toBe(false);
  });
});
