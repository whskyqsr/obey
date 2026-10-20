import { describe, expect, it } from "vitest";
import { taskStats } from "../src/routes/tasks.js";

const at = (d: string) => new Date(`${d}T12:00:00Z`);

describe("taskStats", () => {
  it("is empty before anything is due", () => {
    expect(taskStats([])).toEqual({ done: 0, missed: 0, excused: 0, rate: null, streak: 0, bestStreak: 0, lastDoneAt: null });
  });

  it("counts streaks across excused days and resets on a miss", () => {
    const s = taskStats([
      { status: "completed", completedAt: at("2026-10-01") },
      { status: "completed", completedAt: at("2026-10-02") },
      { status: "completed", completedAt: at("2026-10-03") },
      { status: "missed", completedAt: null },
      { status: "completed", completedAt: at("2026-10-05") },
      { status: "excused", completedAt: null },
      { status: "completed", completedAt: at("2026-10-07") },
    ]);
    expect(s).toEqual({ done: 5, missed: 1, excused: 1, rate: 5 / 6, streak: 2, bestStreak: 3, lastDoneAt: "2026-10-07T12:00:00.000Z" });
  });
});
