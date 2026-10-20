import { useUpdateMe } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { NotifyCategory } from "../api/types";
import { useRel } from "../lib/relationship";
import { Switch, useSnackbar } from "./ui";

export const NOTIFY_TYPES: { key: NotifyCategory; label: string; help: string; feature?: "points" }[] = [
  { key: "reminders", label: "Reminders", help: "Before a task is due" },
  { key: "completions", label: "Done and reviewed", help: "When a task is completed, sent for review, approved or sent back" },
  { key: "missed", label: "Missed tasks", help: "When a deadline passes" },
  { key: "requests", label: "More time", help: "Requests for more time, the answers, and moved deadlines" },
  { key: "comments", label: "Comments", help: "On a task's due date" },
  { key: "assigned", label: "New tasks and consequences", help: "Tasks given to you, history corrections and logged broken rules" },
  { key: "plans", label: "Plans", help: "When a partner adds or changes a calendar plan" },
  { key: "rewards", label: "Rewards", help: "When a reward is redeemed", feature: "points" },
];

/** Which kinds of notification this account gets, on every device. Anything about the dynamic itself always comes through. */
export function NotificationTypes() {
  const { me, features } = useRel();
  const updateMe = useUpdateMe();
  const snack = useSnackbar();
  const muted = new Set(me.user.mutedNotifications ?? []);
  const set = (key: NotifyCategory, on: boolean) => {
    const next = new Set(muted);
    if (on) next.delete(key);
    else next.add(key);
    updateMe.mutate({ mutedNotifications: [...next] }, { onError: (e) => snack(errorMessage(e)) });
  };
  return (
    <div className="mt-3 rounded-lg bg-surface-container-low px-4 py-2">
      {NOTIFY_TYPES.filter((t) => !t.feature || features[t.feature]).map((t) => (
        <Switch key={t.key} checked={!muted.has(t.key)} onChange={(on) => set(t.key, on)} label={t.label} help={t.help} />
      ))}
      <p className="py-2 text-body-small text-on-surface-variant">Someone joining or leaving your dynamic always comes through.</p>
    </div>
  );
}
