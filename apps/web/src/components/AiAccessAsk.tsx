import { useState } from "react";
import { useAiAccess, useSetAiAccess } from "../api/hooks";
import { errorMessage } from "../api/client";
import { useReadOnly, useRel } from "../lib/relationship";
import { Button, useSnackbar } from "./ui";

const dismissedKey = (rel: string) => `fealty.aiAsk.dismissed.${rel}`;
const readDismissed = (rel: string) => {
  try {
    return localStorage.getItem(dismissedKey(rel)) === "1";
  } catch {
    return false;
  }
};

/** The one-tap ask: a partner has allowed AI access and you haven't yet. Not now hides it on this device. */
export function AiAccessAsk() {
  const { rel, me, memberName } = useRel();
  const readOnly = useReadOnly();
  const [dismissed, setDismissed] = useState(() => readDismissed(rel.id));
  const mine = rel.members.find((m) => m.userId === me.user.id);
  const asker = rel.members.find((m) => m.userId !== me.user.id && m.aiAccess);
  const show = !readOnly && rel.endedAt === null && !!mine && !mine.aiAccess && !!asker && !dismissed;
  if (!show) return null;
  return <Ask relId={rel.id} askerId={asker.userId} askerName={memberName(asker.userId)} onDismiss={() => setDismissed(true)} />;
}

function Ask({ relId, askerId, askerName, onDismiss }: { relId: string; askerId: string; askerName: string; onDismiss(): void }) {
  const snack = useSnackbar();
  const q = useAiAccess(relId);
  const set = useSetAiAccess(relId);
  const app = q.data?.apps.find((a) => a.userId === askerId)?.app ?? "an AI app";
  return (
    <div className="px-4 pb-4 md:px-6">
      <div className="flex flex-col gap-2 rounded-md border border-outline-variant bg-surface-container-lowest px-5 py-4 text-on-surface">
        <div className="text-body-large">
          <span className="font-semibold">{askerName}</span> wants to use Fealty with {app}.
        </div>
        <p className="text-body-medium text-on-surface-variant">It would see and do what each of you can here. You can switch it off any time.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button busy={set.isPending} onClick={() => set.mutate(true, { onSuccess: () => snack("AI access allowed"), onError: (e) => snack(errorMessage(e)) })}>
            Allow
          </Button>
          <Button
            variant="text"
            className="text-on-surface-variant"
            onClick={() => {
              try {
                localStorage.setItem(dismissedKey(relId), "1");
              } catch {
                // Hidden for this visit only.
              }
              onDismiss();
            }}
          >
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
}
