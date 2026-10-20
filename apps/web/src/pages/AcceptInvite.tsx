import { useEffect, useState } from "react";
import { useInvitePreview, useJoinRelationship, useMe } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Role } from "../api/types";
import { DynamicHero } from "../components/DynamicHero";
import { Button, ErrorBox, Icon, Loading, SegmentedButtons } from "../components/ui";
import { clearPendingInvite } from "../lib/invite";
import { ROLE_LABEL } from "../lib/relationship";
import { storage } from "../lib/storage";

const ROLES: { value: Role; label: string }[] = (["dominant", "submissive", "switch"] as const).map((r) => ({ value: r, label: ROLE_LABEL[r] }));
const article = (role: Role) => (role === "switch" ? "a Switch" : `the ${ROLE_LABEL[role]}`);

/** An opened invite link, after sign-in: who it's from and what you'd be, then Accept or Not now. */
export function AcceptInvite({ code, onDone }: { code: string; onDone(): void }) {
  const preview = useInvitePreview(code);
  const me = useMe();
  const join = useJoinRelationship();
  const [role, setRole] = useState<Role>("submissive");

  function finish(relationshipId?: string) {
    if (relationshipId) storage.set("obey.relationship", relationshipId);
    clearPendingInvite();
    onDone();
  }

  const p = preview.data;
  // Opening your own link, or one for a dynamic you're already in, just opens it.
  useEffect(() => {
    if (p?.alreadyMember) finish(p.relationshipId);
  }, [p]); // eslint-disable-line react-hooks/exhaustive-deps
  if (p?.alreadyMember) return null;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-container-low p-4">
      <div className="w-full max-w-md rounded-xl bg-surface p-8 shadow-elev-1">
        {!p && <Icon name="mail" filled size={40} className="mb-4 text-primary" />}
        {preview.isLoading && <Loading />}
        {preview.error && (
          <>
            <h1 className="mb-4 text-headline-small text-on-surface">This invite can't be used</h1>
            <ErrorBox error="It may have expired or already been accepted. Ask for a new link." />
            <Button className="mt-6 w-full" onClick={() => finish()}>
              Continue
            </Button>
          </>
        )}
        {p && (
          <>
            <DynamicHero
              className="mb-8"
              people={[{ userId: "inviter", displayName: p.inviterName, avatarVersion: null }, ...(me.data ? [{ ...me.data.user, userId: me.data.user.id }] : [])]}
              title={`${p.inviterName} invited you`}
              sub={p.role ? `You'll join their dynamic as ${article(p.role)}.` : "Choose your role to join their dynamic."}
            />
            {!p.role && (
              <div className="mb-6">
                <div className="mb-2 text-label-large text-on-surface-variant">Your role</div>
                <SegmentedButtons<Role> value={role} onChange={setRole} options={ROLES} className="w-full" />
              </div>
            )}
            {join.error && <p className="mb-4 text-body-medium text-error">{errorMessage(join.error)}</p>}
            <div className="flex gap-2">
              <Button variant="text" onClick={() => finish()}>
                Not now
              </Button>
              <div className="flex-1" />
              <Button busy={join.isPending} onClick={() => join.mutate({ code, role: p.role ? undefined : role }, { onSuccess: (r) => finish(r.id) })}>
                Accept
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
