import { useUpdateMe } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { NotifyCategory } from "../api/types";
import { useRel } from "../lib/relationship";
import { Switch, useSnackbar } from "./ui";

export const NOTIFY_TYPES: { key: NotifyCategory; label: string; feature?: "points" }[] = [
  { key: "reminders", label: "Reminders" },
  { key: "completions", label: "Done and reviewed" },
  { key: "missed", label: "Missed tasks" },
  { key: "requests", label: "More time" },
  { key: "comments", label: "Comments" },
  { key: "assigned", label: "New tasks and consequences" },
  { key: "plans", label: "Plans" },
  { key: "rewards", label: "Rewards", feature: "points" },
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
    <div className="flex flex-col">
      {NOTIFY_TYPES.filter((t) => !t.feature || features[t.feature]).map((t) => (
        <Switch key={t.key} checked={!muted.has(t.key)} onChange={(on) => set(t.key, on)} label={t.label} />
      ))}
      <div className="my-2 border-t border-outline-variant" />
      <Switch
        checked={me.user.notifyDetails ?? false}
        onChange={(notifyDetails) => updateMe.mutate({ notifyDetails }, { onError: (e) => snack(errorMessage(e)) })}
        label="Show your partner's words"
        help={`A reminder written for you, or the line sent with "I'm home", shows in the notification. Off, notifications only say who did what, so nothing personal is on your lock screen.`}
      />
      <p className="py-2 text-body-small text-on-surface-variant">Someone joining or leaving your dynamic always comes through.</p>
    </div>
  );
}
