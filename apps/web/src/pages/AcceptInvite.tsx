import { useEffect, useState } from "react";
import { useInvitePreview, useJoinRelationship } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Role } from "../api/types";
import { Avatar } from "../components/Avatar";
import { FirstRunPage, FirstRunTitle } from "../components/FirstRun";
import { Button, Chip, Loading } from "../components/ui";
import { clearPendingInvite } from "../lib/invite";
import { ROLE_LABEL } from "../lib/relationship";
import { storage } from "../lib/storage";
import { startWelcome } from "../lib/welcome";

const ROLES: { value: Role; label: string }[] = (["dominant", "submissive", "switch"] as const).map((r) => ({ value: r, label: ROLE_LABEL[r] }));
const article = (role: Role) => (role === "switch" ? "a Switch" : `the ${ROLE_LABEL[role]}`);

/** An opened invite link, after sign-in: who it's from and what you'd be, then Accept or Not now. */
export function AcceptInvite({ code, onDone }: { code: string; onDone(): void }) {
  const preview = useInvitePreview(code);
  const join = useJoinRelationship();
  const [role, setRole] = useState<Role>("submissive");

  function finish(relationshipId?: string, joined = false) {
    if (relationshipId) storage.set("obey.relationship", relationshipId);
    if (relationshipId && joined) startWelcome(relationshipId);
    clearPendingInvite();
    onDone();
  }

  const p = preview.data;
  // Opening your own link, or one for a dynamic you're already in, just opens it.
  useEffect(() => {
    if (p?.alreadyMember) finish(p.relationshipId);
  }, [p]); // eslint-disable-line react-hooks/exhaustive-deps
  if (p?.alreadyMember) return null;

  if (preview.isLoading)
    return (
      <FirstRunPage>
        <Loading />
      </FirstRunPage>
    );
  if (preview.error || !p)
    return (
      <FirstRunPage
        actions={
          <Button className="h-12 w-full" onClick={() => finish()}>
            Continue
          </Button>
        }
      >
        <FirstRunTitle sub="It may have expired or already been accepted. Ask for a new link.">This invite can't be used.</FirstRunTitle>
      </FirstRunPage>
    );
  return (
    <FirstRunPage
      center
      actions={
        <>
          {join.error && <p className="text-body-medium text-error">{errorMessage(join.error)}</p>}
          <Button
            className="h-12 w-full"
            busy={join.isPending}
            onClick={() => join.mutate({ code, role: p.role ? undefined : role }, { onSuccess: (r) => finish(r.id, true) })}
          >
            Accept
          </Button>
          <button type="button" onClick={() => finish()} className="py-2 text-body-large text-on-surface">
            Not now
          </button>
        </>
      }
    >
      <div className="flex flex-col items-center pt-16">
        <Avatar userId="inviter" name={p.inviterName} version={null} size={84} />
        <h1 className="mt-6 font-serif text-[40px] leading-[1.1] text-on-surface">{p.inviterName} invited you.</h1>
        <p className="mt-3 text-body-large text-on-surface-variant">{p.role ? `You'll join as ${article(p.role)}.` : "Choose your role to join."}</p>
        {!p.role && (
          <div className="mt-6 flex flex-wrap justify-center gap-2" role="radiogroup" aria-label="Your role">
            {ROLES.map((r) => (
              <Chip key={r.value} plain selected={role === r.value} onClick={() => setRole(r.value)}>
                {r.label}
              </Chip>
            ))}
          </div>
        )}
      </div>
    </FirstRunPage>
  );
}
