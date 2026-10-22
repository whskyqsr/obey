import { useAftercareDone, useAftercarePlans, useScenes } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Scene } from "../api/types";
import { useReadOnly, useRel } from "../lib/relationship";
import { CheckIn } from "../pages/Scenes";
import { Button, Chip, useSnackbar } from "./ui";

const DAY = 86_400_000;

/** "last night" for an evening scene, "yesterday" otherwise, as the server words the push. */
const whenWas = (s: Scene) => {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: s.timezone }).format(new Date(s.occurredAt)));
  return hour >= 17 || hour < 4 ? "last night" : "yesterday";
};

/**
 * On Today, right after a scene: the others' aftercare plans until closed (for a day), and the next morning the check-in
 * until answered (for three days). Only the latest scene of each shows.
 */
export function SceneCards() {
  const { rel, me, features, memberName } = useRel();
  const everyone = rel.members.length === 2 ? "both of you" : "everyone in your dynamic";
  const readOnly = useReadOnly();
  const on = features.scenes && !readOnly;
  const scenes = useScenes(rel.id, on);
  const plans = useAftercarePlans(rel.id, on);
  const done = useAftercareDone(rel.id);
  const snack = useSnackbar();
  if (!on || !scenes.data) return null;
  const now = Date.now();
  const fresh = scenes.data.find((s) => now - Date.parse(s.createdAt) < DAY && !s.aftercareDone);
  const theirs = (plans.data ?? []).filter((p) => p.userId !== me.user.id && (p.needs.length || p.note));
  const check = scenes.data.find((s) => now >= Date.parse(s.checkFrom) && now < Date.parse(s.checkFrom) + 3 * DAY && !s.checks.some((c) => c.userId === me.user.id));
  if (!(fresh && theirs.length) && !check) return null;
  return (
    <div className="flex flex-col gap-3 px-4 pb-4 md:px-6">
      {fresh && theirs.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl bg-tertiary-container px-4 py-4 text-on-tertiary-container">
          {theirs.map((p) => (
            <div key={p.userId} className="flex flex-col gap-2">
              <div className="text-title-medium">Aftercare for {memberName(p.userId)}</div>
              {p.needs.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {p.needs.map((n) => (
                    <Chip key={n} className="border-on-tertiary-container/40 text-on-tertiary-container">
                      {n}
                    </Chip>
                  ))}
                </div>
              )}
              {p.note && <p className="text-body-medium whitespace-pre-wrap">{p.note}</p>}
            </div>
          ))}
          <Button className="mt-1 self-start" busy={done.isPending} onClick={() => done.mutate(fresh.id, { onError: (e) => snack(errorMessage(e)) })}>
            Done
          </Button>
        </div>
      )}
      {check && (
        <div className="flex flex-col gap-2 rounded-xl bg-surface-container-high px-4 py-4 text-on-surface">
          <div>
            <div className="text-title-medium">How are you feeling after {whenWas(check)}?</div>
            <div className="text-body-medium text-on-surface-variant">
              Saved with {check.title ? `“${check.title}”` : "the scene"}, for {everyone} to see.
            </div>
          </div>
          <CheckIn s={check} />
        </div>
      )}
    </div>
  );
}
