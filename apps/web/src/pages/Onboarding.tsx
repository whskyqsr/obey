import { useState } from "react";
import { useCreateRelationship, useJoinRelationship } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Role } from "../api/types";
import { Button, Icon, SegmentedButtons, TextField } from "../components/ui";
import { parseInvite } from "../lib/invite";
import { ROLE_LABEL } from "../lib/relationship";

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
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-container-low p-4" style={{ ["--field-bg" as string]: "var(--md-surface)" }}>
      <div className="w-full max-w-md rounded-xl bg-surface p-8 shadow-elev-1">
        <Icon name="favorite" filled size={40} className="mb-4 text-primary" />
        <h1 className="text-headline-medium text-on-surface">Set up your dynamic</h1>
        <p className="mt-2 mb-6 text-body-large text-on-surface-variant">Create a relationship and invite your partner, or join one with the code they sent you.</p>
        {body}
      </div>
    </div>
  );
}
