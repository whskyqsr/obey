import { useState } from "react";
import { useCreateRelationship, useJoinRelationship } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Role } from "../api/types";
import { FirstRunPage, FirstRunTitle } from "../components/FirstRun";
import { Button, Chip, SegmentedButtons, TextField, cx } from "../components/ui";
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
        <TextField
          label="Name (optional)"
          help="Leave it blank to show your partner's name instead."
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
        />
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

/** The very first screen after signing in (mockup 33): start a dynamic, picking a role, or join one with an invite. */
function FirstRun() {
  const [mode, setMode] = useState<"create" | "join">("create");
  const [role, setRole] = useState<Role>("dominant");
  const [joinRole, setJoinRole] = useState<Role>("submissive");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const create = useCreateRelationship();
  const join = useJoinRelationship();
  const m = mode === "create" ? create : join;
  // The new dynamic opens first, and its setup steps follow.
  const done = (r: { id: string }) => {
    storage.set("obey.relationship", r.id);
    startWelcome(r.id);
  };
  const go = () =>
    mode === "create"
      ? create.mutate({ name: name.trim() || null, role }, { onSuccess: done })
      : // A pasted link works as well as the bare code; a role named on the invite wins.
        join.mutate({ code: parseInvite(code) ?? code.trim(), role: joinRole }, { onSuccess: done });
  const box = (on: boolean) =>
    cx("flex flex-col gap-1 rounded-md border bg-surface-container-lowest px-5 py-5 text-left", on ? "border-on-surface" : "border-outline-variant");

  return (
    <FirstRunPage
      actions={
        <>
          {m.error && <p className="text-body-medium text-error">{errorMessage(m.error)}</p>}
          <Button busy={m.isPending} disabled={mode === "join" && code.trim().length < 4} onClick={go} className="h-12 w-full">
            Continue
          </Button>
        </>
      }
    >
      <FirstRunTitle sub="Are you starting something new, or joining your partner?">Welcome.</FirstRunTitle>
      <div className="mt-8 flex flex-col gap-3">
        <section className={box(mode === "create")} onClick={() => setMode("create")} onFocus={() => setMode("create")}>
          <h2 className="font-serif text-[26px] leading-8 text-on-surface">Start a new dynamic</h2>
          <p className="text-body-medium text-on-surface-variant">You'll invite your partner next.</p>
          <div className="mt-3 text-body-small text-on-surface-variant">Your role</div>
          <div className="mt-1 flex flex-wrap gap-2" role="radiogroup" aria-label="Your role">
            {ROLES.map((r) => (
              <Chip key={r.value} plain selected={role === r.value} onClick={() => setRole(r.value)}>
                {r.label}
              </Chip>
            ))}
          </div>
          <TextField className="mt-3" label="Name for the dynamic (optional)" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </section>
        <section className={box(mode === "join")} onClick={() => setMode("join")} onFocus={() => setMode("join")}>
          <h2 className="font-serif text-[26px] leading-8 text-on-surface">I have an invite</h2>
          <p className="text-body-medium text-on-surface-variant">Paste the link or type the code from it.</p>
          <TextField
            className="mt-3"
            label="Invite link or code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoCapitalize="characters"
            spellCheck={false}
          />
          {mode === "join" && (
            <>
              <div className="mt-3 text-body-small text-on-surface-variant">Your role, if the invite leaves it to you</div>
              <div className="mt-1 flex flex-wrap gap-2" role="radiogroup" aria-label="Your role">
                {ROLES.map((r) => (
                  <Chip key={r.value} plain selected={joinRole === r.value} onClick={() => setJoinRole(r.value)}>
                    {r.label}
                  </Chip>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </FirstRunPage>
  );
}
