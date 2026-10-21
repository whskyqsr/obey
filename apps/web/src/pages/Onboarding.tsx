import { useState } from "react";
import { useCreateRelationship, useJoinRelationship } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Role } from "../api/types";
import { BrandMark } from "../components/BrandMark";
import { Button, Icon, SegmentedButtons, TextField, cx } from "../components/ui";
import { parseInvite } from "../lib/invite";
import { ROLE_LABEL } from "../lib/relationship";
import { storage } from "../lib/storage";
import { startWelcome } from "../lib/welcome";

const ROLES: { value: Role; label: string }[] = (["dominant", "submissive", "switch"] as const).map((r) => ({ value: r, label: ROLE_LABEL[r] }));

/** Create a relationship or join one with an invite code. */
export function Onboarding({ onDone, embedded }: { onDone?: (relationshipId: string) => void; embedded?: boolean }) {
  const [mode, setMode] = useState<"create" | "join">("create");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [role, setRole] = useState<Role>("dominant");
  const create = useCreateRelationship();
  const join = useJoinRelationship();
  const m = mode === "create" ? create : join;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const done = (r: { id: string }) => onDone?.(r.id);
    if (mode === "create") create.mutate({ name: name.trim() || null, role }, { onSuccess: done });
    // A pasted link works as well as the bare code.
    else join.mutate({ code: parseInvite(code) ?? code.trim(), role }, { onSuccess: done });
  }

  const body = (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <SegmentedButtons<"create" | "join">
        value={mode}
        onChange={(v) => {
          setMode(v);
          setRole(v === "join" ? "submissive" : "dominant");
        }}
        options={[
          { value: "create", label: "Start new", icon: "add" },
          { value: "join", label: "Join with code", icon: "key" },
        ]}
      />
      {mode === "create" ? (
        <TextField label="Name (optional)" help="Leave it blank to show your partner's name instead." value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
      ) : (
        <TextField label="Invite link or code" value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="characters" spellCheck={false} />
      )}
      <div>
        <div className="mb-2 text-label-large text-on-surface-variant">Your role</div>
        <SegmentedButtons<Role> value={role} onChange={setRole} options={ROLES} className="w-full" />
        {mode === "join" && <p className="mt-2 text-body-small text-on-surface-variant">If the invite already names your role, that's the one you get.</p>}
      </div>
      {m.error && <p className="text-body-medium text-error">{errorMessage(m.error)}</p>}
      <Button type="submit" busy={m.isPending} disabled={mode === "join" && code.trim().length < 4}>
        {mode === "create" ? "Create relationship" : "Join"}
      </Button>
    </form>
  );

  if (embedded) return body;
  return <FirstRun />;
}

const ROLE_HELP: Record<Role, string> = {
  dominant: "You set tasks, rules and rewards, and approve what's done.",
  submissive: "You see what's due, complete it, and ask for more time when you need it.",
  switch: "Some of both. You can set and manage tasks like a Dominant.",
};

/** The very first screen after signing in: start a dynamic (picking a role) or join one with an invite. */
function FirstRun() {
  const [stage, setStage] = useState<"choose" | "create" | "join">("choose");
  const [role, setRole] = useState<Role>("dominant");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const create = useCreateRelationship();
  const join = useJoinRelationship();
  // The new dynamic opens first, and its setup steps follow.
  const done = (r: { id: string }) => {
    storage.set("obey.relationship", r.id);
    startWelcome(r.id);
  };

  return (
    <div className="flex min-h-dvh items-start justify-center bg-surface-container-low p-4 sm:items-center" style={{ ["--field-bg" as string]: "var(--md-surface)" }}>
      <div className="w-full max-w-lg rounded-xl bg-surface p-6 shadow-elev-1 sm:p-8">
        {stage === "choose" && (
          <>
            <BrandMark className="mb-4 size-12 rounded-md" />
            <h1 className="text-headline-medium text-on-surface">Welcome to Fealty</h1>
            <p className="mt-2 mb-6 text-body-large text-on-surface-variant">Tasks, rules and rewards for your dynamic, shared between the two of you.</p>
            <div className="flex flex-col gap-3">
              <Choice icon="add" title="Start a new dynamic" body="Set it up, then invite your partner." onClick={() => setStage("create")} />
              <Choice icon="key" title="I have an invite" body="Use the link or code your partner sent you." onClick={() => setStage("join")} />
            </div>
          </>
        )}
        {stage === "create" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate({ name: name.trim() || null, role }, { onSuccess: done });
            }}
            className="flex flex-col gap-5"
          >
            <div>
              <h1 className="text-headline-small text-on-surface">What's your role?</h1>
              <p className="mt-2 text-body-large text-on-surface-variant">This decides what you see. You can start another dynamic with a different role later.</p>
            </div>
            <div role="radiogroup" className="flex flex-col gap-2">
              {(["dominant", "submissive", "switch"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={role === r}
                  onClick={() => setRole(r)}
                  className={cx(
                    "state-layer flex items-start gap-3 rounded-lg border px-4 py-3 text-left",
                    role === r ? "border-primary bg-primary-container text-on-primary-container" : "border-outline-variant text-on-surface",
                  )}
                >
                  <Icon name={role === r ? "radio_button_checked" : "radio_button_unchecked"} className={role === r ? "text-primary" : "text-on-surface-variant"} />
                  <span>
                    <span className="block text-title-medium">{ROLE_LABEL[r]}</span>
                    <span className="block text-body-medium opacity-80">{ROLE_HELP[r]}</span>
                  </span>
                </button>
              ))}
            </div>
            <TextField
              label="Name for the dynamic (optional)"
              help="Leave it blank to show your partner's name instead."
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
            />
            {create.error && <p className="text-body-medium text-error">{errorMessage(create.error)}</p>}
            <div className="flex gap-2">
              <Button variant="text" onClick={() => setStage("choose")}>
                Back
              </Button>
              <span className="flex-1" />
              <Button type="submit" busy={create.isPending}>
                Continue
              </Button>
            </div>
          </form>
        )}
        {stage === "join" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              // A pasted link works as well as the bare code.
              join.mutate({ code: parseInvite(code) ?? code.trim(), role }, { onSuccess: done });
            }}
            className="flex flex-col gap-5"
          >
            <div>
              <h1 className="text-headline-small text-on-surface">Join your partner</h1>
              <p className="mt-2 text-body-large text-on-surface-variant">Paste the invite link or type the code from it.</p>
            </div>
            <TextField label="Invite link or code" value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="characters" spellCheck={false} autoFocus />
            <div>
              <div className="mb-2 text-label-large text-on-surface-variant">Your role</div>
              <SegmentedButtons<Role> value={role} onChange={setRole} options={ROLES} className="w-full" />
              <p className="mt-2 text-body-small text-on-surface-variant">If the invite already names your role, that's the one you get.</p>
            </div>
            {join.error && <p className="text-body-medium text-error">{errorMessage(join.error)}</p>}
            <div className="flex gap-2">
              <Button variant="text" onClick={() => setStage("choose")}>
                Back
              </Button>
              <span className="flex-1" />
              <Button type="submit" busy={join.isPending} disabled={code.trim().length < 4}>
                Join
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Choice({ icon, title, body, onClick }: { icon: string; title: string; body: string; onClick(): void }) {
  return (
    <button type="button" onClick={onClick} className="state-layer flex items-center gap-4 rounded-lg bg-surface-container-low px-4 py-4 text-left">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
        <Icon name={icon} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-title-medium text-on-surface">{title}</span>
        <span className="block text-body-medium text-on-surface-variant">{body}</span>
      </span>
      <Icon name="chevron_right" className="text-on-surface-variant" />
    </button>
  );
}
