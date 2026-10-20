import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useCreateInvite, useUpdateRelationship } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Features, Invite, ReschedulePolicy, Role } from "../api/types";
import { Avatar } from "../components/Avatar";
import { DynamicHero } from "../components/DynamicHero";
import { Button, Chip, Dialog, Icon, IconButton, Select, Switch, TextField, cx, useSnackbar } from "../components/ui";
import { fmtDate, fmtDateTime, localDateOf } from "../lib/dates";
import { inviteLink } from "../lib/invite";
import { ROLE_LABEL, relTitle, useRel } from "../lib/relationship";
import { useBack } from "../lib/useBack";

const POLICIES: { value: ReschedulePolicy; label: string; help: string }[] = [
  { value: "dominant_only", label: "Dominant only", help: "Only a Dominant can move deadlines." },
  { value: "request", label: "Sub may request", help: "The sub asks; a Dominant approves or declines." },
  { value: "allowance", label: "Weekly allowance", help: "The sub gets a number of free delays each week; more need approval." },
];

const FEATURE_ROWS: { key: keyof Features; label: string; help: string }[] = [
  { key: "points", label: "Points and rewards", help: "Tasks earn points that can be spent on rewards." },
  { key: "consequences", label: "Consequences", help: "A list of consequences, and one per task if it's missed." },
  { key: "rules", label: "Rules", help: "A shared list of standing rules." },
  { key: "protocols", label: "Protocols", help: "Exactly what's expected, and when and how it's done." },
  { key: "journal", label: "Journal", help: "Dated entries with a mood." },
];

/** "Jake & Kitten": the relationship's own name, or everyone in it with you first. */
export function useDynamicTitle() {
  const { rel, me } = useRel();
  if (rel.name) return rel.name;
  const names = [...rel.members].sort((a, b) => Number(b.userId === me.user.id) - Number(a.userId === me.user.id)).map((m) => m.displayName);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} & ${names.at(-1)}` : `${names[0]} (waiting for a partner)`;
}

const Label = ({ children }: { children: ReactNode }) => <h2 className="px-1 pt-6 pb-2 text-title-small text-primary">{children}</h2>;
const Group = ({ children }: { children: ReactNode }) => <div className="overflow-hidden rounded-lg bg-surface-container-low">{children}</div>;

function Row({
  leading,
  headline,
  supporting,
  trailing,
  onClick,
}: {
  leading?: ReactNode;
  headline: ReactNode;
  supporting?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp type={onClick ? "button" : undefined} onClick={onClick} className={cx("flex min-h-14 w-full items-center gap-4 px-4 py-3 text-left", onClick && "state-layer")}>
      {leading}
      <span className="min-w-0 flex-1">
        <span className="block text-body-large text-on-surface">{headline}</span>
        {supporting && <span className="block text-body-medium text-on-surface-variant">{supporting}</span>}
      </span>
      {trailing}
    </Comp>
  );
}

/** Everything about the relationship itself: who's in it, inviting, how it works, and which features are on. */
export function DynamicPage() {
  const { me, rel, self, isDom, select, memberName, features } = useRel();
  const navigate = useNavigate();
  const snack = useSnackbar();
  const update = useUpdateRelationship(rel.id);
  const back = useBack(() => navigate({ to: "/settings" }));
  const title = useDynamicTitle();
  const [sheet, setSheet] = useState<"invite" | "name" | "deadlines" | null>(null);
  const patch = (body: Parameters<typeof update.mutate>[0], msg = "Saved") => update.mutate(body, { onSuccess: () => snack(msg), onError: (e) => snack(errorMessage(e)) });
  const partner = rel.members.find((m) => m.userId !== me.user.id);
  const policy = POLICIES.find((p) => p.value === rel.reschedulePolicy);
  const sub = rel.members.find((m) => m.role === "submissive");

  return (
    <div className="flex flex-col pb-10">
      <header className="sticky top-0 z-10 flex h-16 items-center gap-1 bg-surface px-2 md:px-4">
        <IconButton icon="arrow_back" label="Back" onClick={back} />
        <h1 className="text-title-large text-on-surface">Your dynamic</h1>
      </header>
      <div className="mx-auto w-full max-w-2xl px-4 md:px-6">
        <DynamicHero
          className="py-4"
          people={rel.members}
          title={title}
          sub={[
            self ? `You're the ${ROLE_LABEL[self.role]}` : null,
            `together in Obey since ${fmtDate(localDateOf(new Date(rel.createdAt)), { month: "short", day: "numeric", year: "numeric" })}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        />

        <Label>People</Label>
        <Group>
          {rel.members.map((m) => (
            <Row
              key={m.userId}
              leading={<Avatar userId={m.userId} name={m.displayName} version={m.avatarVersion} />}
              headline={m.userId === me.user.id ? `${m.displayName} (you)` : m.displayName}
              supporting={ROLE_LABEL[m.role]}
            />
          ))}
          <Row
            leading={
              <span className="flex size-10 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container">
                <Icon name="person_add" />
              </span>
            }
            headline="Invite someone"
            onClick={() => setSheet("invite")}
          />
        </Group>

        <Label>How it works</Label>
        <Group>
          <Row
            headline="Name"
            supporting={rel.name ?? `None set, so it shows ${partner ? memberName(partner.userId) : "your partner's name"}`}
            trailing={isDom && <Icon name="edit" className="text-on-surface-variant" />}
            onClick={isDom ? () => setSheet("name") : undefined}
          />
          <Row
            headline="Moving deadlines"
            supporting={rel.reschedulePolicy === "allowance" ? `${policy?.label}: ${rel.weeklyDelayAllowance} free a week` : policy?.help}
            trailing={isDom && <Icon name="chevron_right" className="text-on-surface-variant" />}
            onClick={isDom ? () => setSheet("deadlines") : undefined}
          />
          <div className="px-4 py-1">
            <Switch
              checked={rel.subNotes}
              onChange={(on) => isDom && patch({ subNotes: on }, on ? "Notes turned on for them" : "Notes turned off for them")}
              label={`${sub ? sub.displayName : "A submissive"} can write notes`}
              help="Their own notes. Yours stay read-only to them unless you let them edit one."
            />
          </div>
        </Group>

        <Label>Features</Label>
        <Group>
          <div className="px-4 py-1">
            {FEATURE_ROWS.map((f) => (
              <Switch
                key={f.key}
                checked={features[f.key]}
                onChange={(on) => isDom && patch({ features: { [f.key]: on } }, on ? `${f.label} on` : `${f.label} off`)}
                label={f.label}
                help={f.help}
              />
            ))}
          </div>
        </Group>
        <p className="px-1 pt-2 text-body-small text-on-surface-variant">
          {isDom ? "Switched-off features are hidden for everyone here. Nothing is deleted." : "Only a Dominant can change how this dynamic works."}
        </p>

        <Label>Other dynamics</Label>
        <Group>
          {me.relationships.length > 1 &&
            me.relationships
              .filter((r) => r.id !== rel.id)
              .map((r) => (
                <Row
                  key={r.id}
                  leading={<Icon name="swap_horiz" className="text-on-surface-variant" />}
                  headline={`Switch to ${relTitle(r, me.user.id)}`}
                  onClick={() => {
                    select(r.id);
                    void navigate({ to: "/" });
                  }}
                />
              ))}
          <Row leading={<Icon name="add_link" className="text-on-surface-variant" />} headline="Join or start another" onClick={() => navigate({ to: "/onboarding" })} />
        </Group>
      </div>

      <InviteSheet open={sheet === "invite"} onClose={() => setSheet(null)} />
      <NameDialog open={sheet === "name"} onClose={() => setSheet(null)} onSave={(name) => patch({ name }, "Name saved")} />
      <DeadlinesDialog open={sheet === "deadlines"} onClose={() => setSheet(null)} onSave={(body) => patch(body)} />
    </div>
  );
}

/** Pick what they'll join as, then copy or share a link. */
export function InviteSheet({ open, onClose }: { open: boolean; onClose(): void }) {
  const { rel, self } = useRel();
  const snack = useSnackbar();
  const create = useCreateInvite(rel.id);
  // A Dominant usually invites a submissive and the other way round; a Switch leaves it open.
  const [role, setRole] = useState<Role | null>(self?.role === "dominant" ? "submissive" : self?.role === "submissive" ? "dominant" : null);
  const [invite, setInvite] = useState<Invite | null>(null);
  useEffect(() => {
    if (open) setInvite(null);
  }, [open, role]);
  const link = invite && inviteLink(invite.code);
  const choices: { value: Role | null; label: string }[] = [
    { value: "submissive", label: ROLE_LABEL.submissive },
    { value: "dominant", label: ROLE_LABEL.dominant },
    { value: "switch", label: ROLE_LABEL.switch },
    { value: null, label: "Let them choose" },
  ];
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Invite someone"
      actions={
        link ? (
          <>
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
              Copy
            </Button>
            {"share" in navigator && (
              <Button icon="share" onClick={() => navigator.share({ title: "Join me on Obey", url: link }).catch(() => {})}>
                Share
              </Button>
            )}
          </>
        ) : (
          <>
            <Button variant="text" onClick={onClose}>
              Cancel
            </Button>
            <Button icon="add_link" busy={create.isPending} onClick={() => create.mutate(role, { onSuccess: setInvite, onError: (e) => snack(errorMessage(e)) })}>
              Create link
            </Button>
          </>
        )
      }
    >
      <p className="mb-5">They open the link, sign in or create an account, and accept.</p>
      <div className="mb-2 text-label-large">They'll join as</div>
      <div className="mb-5 flex flex-wrap gap-2">
        {choices.map((c) => (
          <Chip key={c.label} selected={role === c.value} onClick={() => setRole(c.value)}>
            {c.label}
          </Chip>
        ))}
      </div>
      {invite && link && (
        <>
          <div className="flex items-center gap-3 rounded-md bg-surface px-4 py-3">
            <Icon name="link" className="text-on-surface-variant" />
            <span className="min-w-0 flex-1 text-body-large break-all text-on-surface">{link.replace(/^https?:\/\//, "")}</span>
          </div>
          <div className="mt-2 text-body-small">
            Works once · code {invite.code} · expires {fmtDateTime(invite.expiresAt)}
          </div>
        </>
      )}
    </Dialog>
  );
}

function NameDialog({ open, onClose, onSave }: { open: boolean; onClose(): void; onSave(name: string | null): void }) {
  const { rel } = useRel();
  const title = useDynamicTitle();
  const [name, setName] = useState(rel.name ?? "");
  useEffect(() => {
    if (open) setName(rel.name ?? "");
  }, [open, rel.name]);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Name"
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onSave(name.trim() || null);
              onClose();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <TextField
        label="Name (optional)"
        placeholder={title}
        help="Without a name, the app shows your partner's name."
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={80}
      />
    </Dialog>
  );
}

function DeadlinesDialog({ open, onClose, onSave }: { open: boolean; onClose(): void; onSave(body: { reschedulePolicy: ReschedulePolicy; weeklyDelayAllowance?: number }): void }) {
  const { rel } = useRel();
  const [policy, setPolicy] = useState(rel.reschedulePolicy);
  const [allowance, setAllowance] = useState(String(rel.weeklyDelayAllowance));
  useEffect(() => {
    if (!open) return;
    setPolicy(rel.reschedulePolicy);
    setAllowance(String(rel.weeklyDelayAllowance));
  }, [open, rel.reschedulePolicy, rel.weeklyDelayAllowance]);
  const n = Math.max(0, Math.min(50, Math.trunc(Number(allowance) || 0)));
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Moving deadlines"
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onSave(policy === "allowance" ? { reschedulePolicy: policy, weeklyDelayAllowance: n } : { reschedulePolicy: policy });
              onClose();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Select label="Who can move deadlines" value={policy} onChange={(e) => setPolicy(e.target.value as ReschedulePolicy)} help={POLICIES.find((p) => p.value === policy)?.help}>
          {POLICIES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </Select>
        {policy === "allowance" && <TextField label="Free delays per week" type="number" min={0} max={50} value={allowance} onChange={(e) => setAllowance(e.target.value)} />}
      </div>
    </Dialog>
  );
}
