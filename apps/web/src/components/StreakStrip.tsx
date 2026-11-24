import { useStreaks } from "../api/hooks";
import type { TaskStreak } from "../api/types";
import { useRel } from "../lib/relationship";
import { Diamond, cx } from "./ui";

const SLOTS = 7;
const WORD = { completed: "done", missed: "missed", excused: "excused" } as const;

/** The last few results as small diamonds (done filled, excused muted, missed in the accent) and the current streak. Renders nothing for a task with no history. */
export function StreakStrip({ taskId, className, compact }: { taskId: string; className?: string; compact?: boolean }) {
  const { rel } = useRel();
  const s = useStreaks(rel.id).data?.find((x) => x.taskId === taskId);
  if (!s || !s.recent.length) return null;
  return <Strip s={s} className={className} compact={compact} />;
}

/** `compact` is for rows: the last five, without placeholder dots. */
export function Strip({ s, className, compact }: { s: TaskStreak; className?: string; compact?: boolean }) {
  const recent = compact ? s.recent.slice(-5) : s.recent;
  const pad = compact ? 0 : SLOTS - recent.length;
  return (
    <span
      role="img"
      aria-label={`Streak ${s.streak}. Last ${s.recent.length}: ${s.recent.map((r) => WORD[r]).join(", ")}`}
      className={cx("inline-flex items-center gap-1.5", className)}
    >
      <span className="inline-flex items-center gap-1.5">
        {Array.from({ length: pad }, (_, i) => (
          <Diamond key={`p${i}`} state="off" size={7} className="opacity-50" />
        ))}
        {recent.map((r, i) => (
          <Diamond key={i} size={7} state={r === "completed" ? "done" : r === "missed" ? "owed" : "off"} />
        ))}
      </span>
      <span className={cx("text-label-medium tabular-nums", "text-on-surface-variant")}>{s.streak} in a row</span>
    </span>
  );
}
