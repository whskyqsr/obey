import { describe, expect, it } from "vitest";
import { monthGrid, startOfWeek } from "./dates";

describe("startOfWeek", () => {
  // 2026-10-20 is a Tuesday.
  it("starts on Sunday by default", () => {
    expect(startOfWeek("2026-10-20")).toBe("2026-10-18");
    expect(startOfWeek("2026-10-18")).toBe("2026-10-18");
  });
  it("can start on Monday", () => {
    expect(startOfWeek("2026-10-20", "mon")).toBe("2026-10-19");
    expect(startOfWeek("2026-10-18", "mon")).toBe("2026-10-12");
  });
  it("lays the month grid out from the week's first day", () => {
    expect(monthGrid("2026-10-15")[0]).toBe("2026-09-27");
    expect(monthGrid("2026-10-15", "mon")[0]).toBe("2026-09-28");
  });
});
