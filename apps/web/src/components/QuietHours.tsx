import { useState } from "react";
import { useUpdateMe } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { QuietHours } from "../api/types";
import { useRel } from "../lib/relationship";
import { Switch, TextField, useSnackbar } from "./ui";

const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const DEFAULT: Omit<QuietHours, "timezone"> = { start: "22:00", end: "07:00" };

/** Quiet hours: notifications still arrive, but without sound or vibration, on every device on the account. */
export function QuietHoursSetting() {
  const { me } = useRel();
  const updateMe = useUpdateMe();
  const snack = useSnackbar();
  const saved = me.user.quietHours;
  const [draft, setDraft] = useState(saved ?? { ...DEFAULT, timezone: zone() });

  const save = (q: QuietHours | null) => updateMe.mutate({ quietHours: q }, { onError: (e) => snack(errorMessage(e)) });
  const change = (patch: Partial<QuietHours>) => {
    const next = { ...draft, ...patch, timezone: zone() };
    setDraft(next);
    if (saved && /^\d\d:\d\d$/.test(next.start) && /^\d\d:\d\d$/.test(next.end)) save(next);
  };

  return (
    <div className="mt-3 rounded-lg bg-surface-container-low px-4 py-2">
      <Switch
        checked={!!saved}
        onChange={(on) => save(on ? { ...draft, timezone: zone() } : null)}
        label="Quiet hours"
        help="Notifications still arrive, just without sound or vibration."
      />
      {saved && (
        <div className="flex flex-wrap items-end gap-3 pb-2">
          <TextField label="From" type="time" value={draft.start} onChange={(e) => change({ start: e.target.value })} className="w-36" />
          <TextField label="Until" type="time" value={draft.end} onChange={(e) => change({ end: e.target.value })} className="w-36" />
          {saved.timezone !== zone() && (
            <span className="pb-3 text-body-small text-on-surface-variant">
              Set in {saved.timezone}; changing a time switches it to {zone()}.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
