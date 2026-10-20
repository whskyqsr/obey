import { useState } from "react";
import type { StarterKit } from "@obey/contracts";
import { useCreateInvite, useUpdateRelationship } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Invite, Role } from "../api/types";
import { AppLockSetting } from "../components/AppLock";
import { Button, Card, Chip, Icon, Switch, useSnackbar } from "../components/ui";
import { fmtDateTime } from "../lib/dates";
import { inviteLink } from "../lib/invite";
import { ROLE_LABEL, useRel } from "../lib/relationship";
import { finishWelcome } from "../lib/welcome";
import { FEATURE_ROWS } from "./Dynamic";
import { KitDialog, useKits } from "./Kits";

type Step = "features" | "privacy" | "invite" | "kits" | "ready";

/**
 * First-run setup right after starting or joining a dynamic: what it uses, privacy, inviting the partner and a
 * starter kit. Every step can be skipped, and everything here can be changed later in Your dynamic or Settings.
 */
export function Welcome() {
  const { me, rel, isDom } = useRel();
  // Alone in it means they started it; someone who joined has a partner already.
  const started = rel.members.length === 1;
  const steps: Step[] = [...(isDom ? (["features"] as const) : []), "privacy", ...(started ? (["invite"] as const) : []), isDom ? "kits" : "ready"];
  const [at, setAt] = useState(0);
  const step = steps[at]!;
  const last = at === steps.length - 1;
  const next = () => (last ? finishWelcome() : setAt(at + 1));
  const partner = rel.members.find((m) => m.userId !== me.user.id);

  return (
    <div className="flex min-h-dvh items-start justify-center bg-surface-container-low p-4 sm:items-center">
      <div className="flex w-full max-w-lg flex-col rounded-xl bg-surface p-6 shadow-elev-1 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex flex-1 gap-1.5" aria-hidden>
            {steps.map((s, i) => (
              <span key={s} className={i <= at ? "h-1 flex-1 rounded-full bg-primary" : "h-1 flex-1 rounded-full bg-surface-container-highest"} />
            ))}
          </div>
          <span className="text-label-medium text-on-surface-variant">
            {at + 1} of {steps.length}
          </span>
        </div>

        {step === "features" && <FeaturesStep />}
        {step === "privacy" && <PrivacyStep uid={me.user.id} />}
        {step === "invite" && <InviteStep />}
        {step === "kits" && <KitsStep />}
        {step === "ready" && <ReadyStep partnerName={partner?.displayName ?? null} />}

        <div className="mt-8 flex items-center gap-2">
          {at > 0 && (
            <Button variant="text" onClick={() => setAt(at - 1)}>
              Back
            </Button>
          )}
          <span className="flex-1" />
          {!last && (
            <Button variant="text" onClick={finishWelcome}>
              Skip setup
            </Button>
          )}
          <Button onClick={next}>{last ? (step === "kits" ? "Start from scratch" : "Open Obey") : "Next"}</Button>
        </div>
      </div>
    </div>
  );
}

function Heading({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <>
      <Icon name={icon} size={32} className="mb-3 text-primary" />
      <h1 className="text-headline-small text-on-surface">{title}</h1>
      <p className="mt-2 mb-5 text-body-large text-on-surface-variant">{body}</p>
    </>
  );
}

function FeaturesStep() {
  const { rel, features } = useRel();
  const update = useUpdateRelationship(rel.id);
  const snack = useSnackbar();
  return (
    <>
      <Heading icon="tune" title="What will you use?" body="Tasks and notes are always there. Turn off anything else your dynamic doesn't need; it's hidden for both of you." />
      <div className="rounded-lg bg-surface-container-low px-4 py-1">
        {FEATURE_ROWS.map((f) => (
          <Switch
            key={f.key}
            checked={features[f.key]}
            onChange={(on) => update.mutate({ features: { [f.key]: on } }, { onError: (e) => snack(errorMessage(e)) })}
            label={f.label}
            help={f.help}
          />
        ))}
      </div>
      <p className="mt-3 text-body-small text-on-surface-variant">You can change these any time in Your dynamic. Nothing is deleted when you switch one off.</p>
    </>
  );
}

function PrivacyStep({ uid }: { uid: string }) {
  return (
    <>
      <Heading icon="visibility_off" title="Keep it private" body="Obey is built to be discreet. Here's what's already on, and what you can add." />
      <div className="mb-3 flex items-start gap-3 rounded-lg bg-surface-container-low px-4 py-3">
        <Icon name="notifications" className="mt-0.5 text-on-surface-variant" />
        <div>
          <div className="text-body-large text-on-surface">Notifications never name the task</div>
          <div className="text-body-medium text-on-surface-variant">They say who did what kind of thing, like "Sam finished a task", so nothing shows on a lock screen.</div>
        </div>
      </div>
      <AppLockSetting uid={uid} />
      <div className="mt-3 flex items-start gap-3 rounded-lg bg-surface-container-low px-4 py-3">
        <Icon name="android" className="mt-0.5 text-on-surface-variant" />
        <div>
          <div className="text-body-large text-on-surface">On Android</div>
          <div className="text-body-medium text-on-surface-variant">The app can lock with your fingerprint or face, and its icon and name can change to something ordinary.</div>
        </div>
      </div>
    </>
  );
}

function InviteStep() {
  const { rel, self } = useRel();
  const snack = useSnackbar();
  const create = useCreateInvite(rel.id);
  const [role, setRole] = useState<Role | null>(self?.role === "dominant" ? "submissive" : self?.role === "submissive" ? "dominant" : null);
  const [invite, setInvite] = useState<Invite | null>(null);
  const link = invite && inviteLink(invite.code);
  const choices: { value: Role | null; label: string }[] = [
    { value: "submissive", label: ROLE_LABEL.submissive },
    { value: "dominant", label: ROLE_LABEL.dominant },
    { value: "switch", label: ROLE_LABEL.switch },
    { value: null, label: "Let them choose" },
  ];
  return (
    <>
      <Heading
        icon="person_add"
        title="Invite your partner"
        body="Send them a link. They sign in or create an account, then accept. You can also do this later from Your dynamic."
      />
      <div className="mb-2 text-label-large text-on-surface-variant">They'll join as</div>
      <div className="mb-5 flex flex-wrap gap-2">
        {choices.map((c) => (
          <Chip
            key={c.label}
            selected={role === c.value}
            onClick={() => {
              setRole(c.value);
              setInvite(null);
            }}
          >
            {c.label}
          </Chip>
        ))}
      </div>
      {link ? (
        <>
          <div className="flex items-center gap-3 rounded-md bg-surface-container-low px-4 py-3">
            <Icon name="link" className="text-on-surface-variant" />
            <span className="min-w-0 flex-1 text-body-large break-all text-on-surface">{link.replace(/^https?:\/\//, "")}</span>
          </div>
          <div className="mt-2 mb-4 text-body-small text-on-surface-variant">
            Works once · code {invite.code} · expires {fmtDateTime(invite.expiresAt)}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outlined"
              icon="content_copy"
              onClick={() =>
                navigator.clipboard?.writeText(link).then(
                  () => snack("Link copied"),
                  () => snack("Couldn't copy"),
                )
              }
            >
              Copy link
            </Button>
            {"share" in navigator && (
              <Button variant="tonal" icon="share" onClick={() => navigator.share({ title: "Join me on Obey", url: link }).catch(() => {})}>
                Share
              </Button>
            )}
          </div>
        </>
      ) : (
        <Button variant="tonal" icon="add_link" busy={create.isPending} onClick={() => create.mutate(role, { onSuccess: setInvite, onError: (e) => snack(errorMessage(e)) })}>
          Create invite link
        </Button>
      )}
    </>
  );
}

function KitsStep() {
  const kits = useKits();
  const [open, setOpen] = useState<StarterKit | null>(null);
  return (
    <>
      <Heading icon="widgets" title="Start with a kit?" body="Ready-made tasks, rules and protocols. Pick what you want from a kit, and edit anything afterwards." />
      <div className="flex flex-col gap-2">
        {kits.map((k) => (
          <Card key={k.id} variant="outlined" onClick={() => setOpen(k)}>
            <div className="flex items-center gap-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary-container text-on-secondary-container">
                <Icon name={k.icon} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-title-small text-on-surface">{k.title}</div>
                <div className="line-clamp-2 text-body-medium text-on-surface-variant">{k.description}</div>
              </div>
              <Icon name="chevron_right" className="text-on-surface-variant" />
            </div>
          </Card>
        ))}
      </div>
      {open && <KitDialog kit={open} onClose={() => setOpen(null)} onApplied={finishWelcome} />}
    </>
  );
}

function ReadyStep({ partnerName }: { partnerName: string | null }) {
  return (
    <Heading
      icon="check_circle"
      title="You're all set"
      body={
        partnerName
          ? `Today shows what's due. ${partnerName} adds your tasks, and you'll get a notification when something new arrives.`
          : "Today shows what's due. Your tasks appear there once they're added."
      }
    />
  );
}
