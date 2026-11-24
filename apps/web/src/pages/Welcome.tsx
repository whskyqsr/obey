import { useEffect, useState } from "react";
import type { StarterKit } from "@obey/contracts";
import { useCreateInvite, useUpdateRelationship } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Invite, Role } from "../api/types";
import { AppLockSetting } from "../components/AppLock";
import { FirstRunPage, FirstRunTitle } from "../components/FirstRun";
import { BackLink, Button, Chip, Diamond, Icon, Switch, useSnackbar } from "../components/ui";
import { fmtDateTime } from "../lib/dates";
import { inviteLink } from "../lib/invite";
import { ROLE_LABEL, useRel } from "../lib/relationship";
import { finishWelcome } from "../lib/welcome";
import { FEATURE_ROWS } from "./Dynamic";
import { KitDialog, useKits } from "./Kits";

type Step = "features" | "invite" | "finish";

/**
 * First-run setup right after starting or joining a dynamic (mockups 34–36): what it uses, inviting the partner, then
 * a starter kit and privacy. Every step can be skipped, and everything here can be changed later in Your dynamic or
 * Settings. Step 1 is the Welcome screen before it, so the count starts at 2.
 */
export function Welcome() {
  const { me, rel, isDom } = useRel();
  // Alone in it means they started it; someone who joined has a partner already.
  const started = rel.members.length === 1;
  const steps: Step[] = [...(isDom ? (["features"] as const) : []), ...(started ? (["invite"] as const) : []), "finish"];
  const [at, setAt] = useState(0);
  const step = steps[at]!;
  const last = at === steps.length - 1;
  const next = () => (last ? finishWelcome() : setAt(at + 1));
  const partner = rel.members.find((m) => m.userId !== me.user.id);

  return (
    <FirstRunPage
      top={
        <div className="grid w-full grid-cols-3 items-center">
          <div>{at > 0 && <BackLink label="Back" onClick={() => setAt(at - 1)} />}</div>
          <span className="text-center text-body-medium text-on-surface-variant">
            {at + 2} of {steps.length + 1}
          </span>
          <div className="text-right">
            {!last && (
              <button type="button" onClick={step === "invite" ? next : finishWelcome} className="py-2 text-body-large text-primary">
                {step === "invite" ? "Later" : "Skip setup"}
              </button>
            )}
          </div>
        </div>
      }
      actions={
        <Button onClick={next} className="h-12 w-full">
          {last ? "I'm all set" : "Continue"}
        </Button>
      }
    >
      {step === "features" && <FeaturesStep />}
      {step === "invite" && <InviteStep />}
      {step === "finish" && <FinishStep uid={me.user.id} partnerName={partner?.displayName ?? null} />}
    </FirstRunPage>
  );
}

function FeaturesStep() {
  const { rel, features } = useRel();
  const update = useUpdateRelationship(rel.id);
  const snack = useSnackbar();
  return (
    <>
      <FirstRunTitle sub="Tasks and notes are always there. Anything off is hidden for both of you, and nothing is deleted.">What will you use?</FirstRunTitle>
      <div className="mt-6">
        {FEATURE_ROWS.map((f) => (
          <div key={f.key} className="border-b border-outline-variant last:border-b-0">
            <Switch
              checked={features[f.key]}
              onChange={(on) => update.mutate({ features: { [f.key]: on } }, { onError: (e) => snack(errorMessage(e)) })}
              label={f.label}
            />
          </div>
        ))}
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
  // A fresh link for each choice of role, so what's shown always matches it.
  useEffect(() => {
    setInvite(null);
    create.mutate(role, { onSuccess: setInvite, onError: (e) => snack(errorMessage(e)) });
  }, [role]); // eslint-disable-line react-hooks/exhaustive-deps
  const choices: { value: Role | null; label: string }[] = [
    { value: "submissive", label: ROLE_LABEL.submissive },
    { value: "dominant", label: ROLE_LABEL.dominant },
    { value: "switch", label: ROLE_LABEL.switch },
    { value: null, label: "Let them choose" },
  ];
  return (
    <>
      <FirstRunTitle sub="They open the link, sign in or make an account, and accept.">Invite your partner.</FirstRunTitle>
      <div className="mt-6 text-body-small text-on-surface-variant">They'll join as</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {choices.map((c) => (
          <Chip key={c.label} plain selected={role === c.value} onClick={() => setRole(c.value)}>
            {c.label}
          </Chip>
        ))}
      </div>
      <div className="mt-6 flex flex-col items-center gap-1 rounded-md border border-outline-variant bg-surface-container-lowest px-5 py-6">
        {link ? (
          <>
            <div className="text-body-medium text-on-surface-variant">{link.replace(/^https?:\/\//, "").replace(invite.code, "")}</div>
            <div className="font-serif text-[44px] leading-tight tracking-wide text-on-surface">{invite.code}</div>
            <div className="text-body-small text-on-surface-variant">Works once · expires {fmtDateTime(invite.expiresAt)}</div>
            <div className="mt-4 grid w-full grid-cols-2 gap-3">
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
              <Button
                icon="share"
                onClick={() => {
                  if (typeof navigator.share === "function") navigator.share({ title: "Join me on Fealty", url: link }).catch(() => {});
                  else void navigator.clipboard?.writeText(link).then(() => snack("Link copied"));
                }}
              >
                Share
              </Button>
            </div>
          </>
        ) : (
          <div className="py-6 text-body-medium text-on-surface-variant">{create.isPending ? "Making a link…" : "No link yet."}</div>
        )}
      </div>
      <p className="mt-4 flex items-start gap-2 text-body-medium text-on-surface-variant">
        <Icon name="notifications_off" size={18} className="mt-0.5" />
        Notifications never name a task unless you both turn that on.
      </p>
    </>
  );
}

/** A Dominant's last step: a starter kit, then privacy. Someone who joined gets privacy alone. */
function FinishStep({ uid, partnerName }: { uid: string; partnerName: string | null }) {
  const { isDom } = useRel();
  const kits = useKits();
  const [open, setOpen] = useState<StarterKit | null>(null);
  const [applied, setApplied] = useState<string[]>([]);
  return (
    <>
      {isDom ? (
        <>
          <FirstRunTitle sub="Ready-made tasks and rules you can edit. Or start blank.">Start with a kit?</FirstRunTitle>
          <ul className="mt-4">
            {kits.map((k) => (
              <li key={k.id} className="border-b border-outline-variant">
                <button
                  type="button"
                  onClick={() => setOpen(k)}
                  className="state-layer state-row flex w-full items-center gap-4 py-3 text-left"
                >
                  <Diamond state={applied.includes(k.id) ? "done" : "open"} size={16} className="mx-1" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-body-large text-on-surface">{k.title}</span>
                    <span className="block truncate text-body-medium text-on-surface-variant">
                      {k.description} · {k.items.length} items
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <FirstRunTitle
          sub={
            partnerName
              ? `Today shows what's due. ${partnerName} adds your tasks, and you'll hear when something new arrives.`
              : "Today shows what's due. Your tasks appear there once they're added."
          }
        >
          You're all set.
        </FirstRunTitle>
      )}
      <h2 className="eyebrow mt-8">Keep it private</h2>
      <AppLockSetting uid={uid} />
      {open && (
        <KitDialog
          kit={open}
          source={{ kit: open.id }}
          onClose={() => setOpen(null)}
          onApplied={() => {
            setApplied((a) => [...a, open.id]);
            setOpen(null);
          }}
        />
      )}
    </>
  );
}
