import { useInvitePreview } from "../api/hooks";
import type { Role } from "../api/types";
import { parseInvite } from "../lib/invite";
import { ROLE_LABEL } from "../lib/relationship";
import { Chip } from "./ui";

const ROLES = (["dominant", "submissive", "switch"] as const).map((r) => ({ value: r, label: ROLE_LABEL[r] }));
export const joinAs = (role: Role) => `You'll join as ${role === "switch" ? "a Switch" : `the ${ROLE_LABEL[role]}`}.`;

/** What a typed invite code says about the role: an invite that names one skips the choice. */
export function useInviteRole(code: string) {
  const parsed = parseInvite(code);
  const preview = useInvitePreview(parsed ?? "", !!parsed);
  return { named: preview.data?.role ?? null, open: !!preview.data && !preview.data.role, invalid: !!parsed && !!preview.error };
}

/** Under an invite code: the role it names, or the role choice when it leaves that to you. */
export function InviteRole({ code, role, onRole }: { code: string; role: Role; onRole(r: Role): void }) {
  const { named, open, invalid } = useInviteRole(code);
  if (invalid) return <p className="mt-3 text-body-small text-error">This invite can't be used. Ask for a new link.</p>;
  if (named) return <p className="mt-3 text-body-medium text-on-surface-variant">{joinAs(named)}</p>;
  if (!open) return null;
  return (
    <>
      <div className="mt-3 text-body-small text-on-surface-variant">Your role</div>
      <div className="mt-1 flex flex-wrap gap-2" role="radiogroup" aria-label="Your role">
        {ROLES.map((r) => (
          <Chip key={r.value} plain selected={role === r.value} onClick={() => onRole(r.value)}>
            {r.label}
          </Chip>
        ))}
      </div>
    </>
  );
}
