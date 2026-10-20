import { describe, expect, it } from "vitest";
import { anniversary, describeDate } from "./dynamicDates";

describe("dynamic dates", () => {
  it("counts years and days to the next anniversary", () => {
    expect(anniversary("2023-03-04", "2026-10-20")).toEqual({ years: 3, daysUntil: 135 });
    expect(anniversary("2023-10-20", "2026-10-20")).toEqual({ years: 3, daysUntil: 0 });
    expect(anniversary("2023-10-21", "2026-10-20")).toEqual({ years: 2, daysUntil: 1 });
  });
  it("moves Feb 29 to Feb 28 in other years", () => {
    expect(anniversary("2024-02-29", "2025-02-28")).toEqual({ years: 1, daysUntil: 0 });
  });
  it("counts down to future dates", () => {
    expect(describeDate("2026-10-25", "2026-10-20")).toContain("in 5 days");
  });
});
