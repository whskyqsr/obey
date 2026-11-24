import { useAftercareDone, useAftercarePlans, useScenes } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Scene } from "../api/types";
import { useReadOnly, useRel } from "../lib/relationship";
import { CheckIn } from "../pages/Scenes";
import { Link } from "@tanstack/react-router";
import { Button, useSnackbar } from "./ui";

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
  const check = scenes.data.find(
    (s) => now >= Date.parse(s.checkFrom) && now < Date.parse(s.checkFrom) + 3 * DAY && !s.checks.some((c) => c.userId === me.user.id),
  );
  if (!(fresh && theirs.length) && !check) return null;
  const likes = (p: (typeof theirs)[number]) => [p.needs.join(", "), p.note].filter(Boolean).join(". ");
  return (
    <div className="flex flex-col gap-4 px-4 pb-4 md:px-6">
      {fresh && theirs.length > 0 && (
        <div className="flex flex-col gap-4 rounded-md border border-primary bg-surface-container-lowest px-5 py-5">
          {theirs.map((p) => (
            <div key={p.userId}>
              <h2 className="eyebrow text-primary">{memberName(p.userId)}’s aftercare plan</h2>
              <p className="mt-2 text-body-large whitespace-pre-wrap text-on-surface">
                {memberName(p.userId)} likes: {likes(p)}
              </p>
            </div>
          ))}
          <div className="flex items-center justify-between gap-4">
            <Button busy={done.isPending} onClick={() => done.mutate(fresh.id, { onError: (e) => snack(errorMessage(e)) })}>
              Done
            </Button>
            <Link to="/scenes/$sceneId" params={{ sceneId: fresh.id }} className="text-label-large text-primary">
              Open the scene
            </Link>
          </div>
        </div>
      )}
      {check && (
        <div className="flex flex-col gap-4 rounded-md border border-outline-variant bg-surface-container-lowest px-5 py-5">
          <h2 className="font-serif text-[28px] leading-9 text-on-surface">How are you feeling after {whenWas(check)}?</h2>
          <CheckIn s={check} />
        </div>
      )}
    </div>
  );
}
