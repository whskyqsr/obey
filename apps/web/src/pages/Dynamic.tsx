import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useCreateInvite, useLeaveRelationship, useMoods, useUpdateRelationship } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { DynamicDate, Features, Invite, Member, Relationship, ReschedulePolicy, Role } from "../api/types";
import { Avatar } from "../components/Avatar";
import { CollarIcon } from "../components/CollarIcon";
import { DynamicHero } from "../components/DynamicHero";
import { SubHeader, BackLink, Button, Checkbox, Chip, Diamond, Dialog, Icon, IconButton, Select, Switch, TextField, cx, useSnackbar } from "../components/ui";
import { ReportDialog } from "../components/Proof";
import { EndSwapDialog, SwapDialog, fmtSwapEnd, swapPartner } from "../components/RoleSwap";
import { fmtClock, fmtDate, fmtDateTime, localDateOf, today } from "../lib/dates";
import { anniversary, describeDate } from "../lib/dynamicDates";
import { inviteLink } from "../lib/invite";
import { ROLE_LABEL, isCollared, relTitle, useRel } from "../lib/relationship";
import { useBack } from "../lib/useBack";
import { aiAccessState } from "./AiAccess";

export const FEATURE_ROWS: { key: keyof Features; label: string; help: string }[] = [
  { key: "points", label: "Points and rewards", help: "Tasks earn points that can be spent on rewards." },
  { key: "consequences", label: "Consequences", help: "A list of consequences, and one per task if it's missed." },
  { key: "rules", label: "Rules", help: "A shared list of standing rules." },
  { key: "protocols", label: "Protocols", help: "Exactly what's expected, and when and how it's done." },
  { key: "journal", label: "Journal", help: "Dated entries with a mood." },
  { key: "stats", label: "Stats", help: "How tasks are going: done and missed over time, by weekday and by task." },
  { key: "review", label: "Monthly review", help: "A focus for each month, and a look back on it together at the end." },
  { key: "limits", label: "Limits", help: "A shared list you each rate, from love to hard limit, seen side by side once you've both finished." },
  { key: "agreement", label: "Agreement", help: "One page you both sign: why you're doing this, what each of you will do, limits and safewords." },
  { key: "scenes", label: "Scenes", help: "Log scenes and how each of you felt about them, keep aftercare plans, and check in the day after." },
  {
    key: "chastity",
    label: "Chastity",
    help: "Locks with a set time or until released, a sealed keybox code, asks for a break or release, and consequences and rewards that add or take off time.",
  },
  { key: "location", label: "Location tasks", help: "Tasks done by getting somewhere, like the gym by 6, checked by the sub's phone." },
];

/** How long proof photos are kept once their task is done. */
const PROOF_DAYS = [
  { value: 1, label: "A day after the task is done" },
  { value: 7, label: "A week after the task is done" },
  { value: 30, label: "30 days after the task is done" },
];

const DATE_PRESETS = ["Anniversary", "Collaring", "First met"];
const DATE_ICON: Record<string, string> = { Anniversary: "favorite", "First met": "waving_hand" };

/** Add or change one of the dynamic's dates; a preset label or any other. */
function DateDialog({
  value,
  onClose,
  onSave,
  onDelete,
}: {
  value: DynamicDate | null;
  onClose(): void;
  onSave(d: DynamicDate): void;
  onDelete(id: string): void;
}) {
  const [label, setLabel] = useState("");
  const [date, setDate] = useState("");
  useEffect(() => {
    if (!value) return;
    setLabel(value.label || "Anniversary");
    setDate(value.date);
  }, [value]);
  const isNew = !value?.id;
  const valid = label.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date);
  return (
    <Dialog
      open={!!value}
      onClose={onClose}
      title={isNew ? "Add a date" : "Edit date"}
      actions={
        <>
          {!isNew && (
            <Button
              variant="text"
              onClick={() => {
                onDelete(value!.id);
                onClose();
              }}
            >
              Remove
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid}
            onClick={() => {
              onSave({ id: value!.id, label: label.trim(), date });
              onClose();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {DATE_PRESETS.map((p) => (
            <Chip key={p} selected={label === p} onClick={() => setLabel(p)}>
              {p}
            </Chip>
          ))}
        </div>
        <TextField label="Name" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} />
        <TextField label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-48" />
      </div>
    </Dialog>
  );
}

/** "Jake & Kitten": the relationship's own name, or everyone in it with you first. */
export function useDynamicTitle() {
  const { rel, me } = useRel();
  if (rel.name) return rel.name;
  const names = [...rel.members].sort((a, b) => Number(b.userId === me.user.id) - Number(a.userId === me.user.id)).map((m) => m.displayName);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} & ${names.at(-1)}` : `${names[0]} (waiting for a partner)`;
}

export const Label = ({ children, id }: { children: ReactNode; id?: string }) => (
  <h2 id={id} className="scroll-mt-4 pt-8 pb-1 eyebrow">
    {children}
  </h2>
);
/** Rows between hairlines, as in the mockups. */
export const Group = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-col divide-y divide-outline-variant border-b border-outline-variant">{children}</div>
);

export function Row({
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
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cx("flex min-h-16 w-full items-center gap-4 py-3.5 text-left", onClick && "state-layer state-row")}
    >
      {leading}
      <span className="min-w-0 flex-1">
        <span className="block text-body-large text-on-surface md:text-[17px]">{headline}</span>
        {supporting && <span className="block text-body-medium text-on-surface-variant">{supporting}</span>}
      </span>
      {trailing}
    </Comp>
  );
}

/** Everything about the relationship itself: who's in it, inviting and how it works. */
export function DynamicPage() {
  const { me, rel, isDom: dom, memberName } = useRel();
  // Nothing in an ended dynamic can change, so nobody gets the controls.
  const isDom = dom && rel.endedAt === null;
  const navigate = useNavigate();
  const snack = useSnackbar();
  const update = useUpdateRelationship(rel.id);
  const back = useBack(() => navigate({ to: "/settings" }));
  const title = useDynamicTitle();
  const [sheet, setSheet] = useState<"invite" | "swap" | "end-swap" | null>(null);
  const swapWith = swapPartner(rel, me.user.id);
  const swap = rel.roleSwap;
  const inSwap = swap && (swap.requestedBy === me.user.id || swap.partnerId === me.user.id);
  const ended = rel.endedAt !== null;
  // The date being edited: an existing one, or a blank new one.
  const [editingDate, setEditingDate] = useState<DynamicDate | null>(null);
  const now = today();
  // Soonest to come round first.
  const dates = [...(rel.dates ?? [])].sort(
    (a, b) => (a.date > now ? 0 : anniversary(a.date, now).daysUntil) - (b.date > now ? 0 : anniversary(b.date, now).daysUntil),
  );
  const saveDates = (next: DynamicDate[], msg: string) => patch({ dates: next }, msg);
  const patch = (body: Parameters<typeof update.mutate>[0], msg = "Saved") =>
    update.mutate(body, { onSuccess: () => snack(msg), onError: (e) => snack(errorMessage(e)) });

  return (
    <div className="flex flex-col pb-10">
      <div className="mx-auto w-full max-w-2xl">
        <TopBar back={back} onInvite={ended ? undefined : () => setSheet("invite")} />
      </div>
      <div className="mx-auto w-full max-w-2xl px-4 md:px-6">
        <DynamicHero
          className="pt-2 pb-2"
          size={72}
          large
          people={rel.members.map((m) => ({ ...m, collared: isCollared(rel, m.userId) }))}
          title={title}
          sub={whoLeads(rel.members)}
        />

        {ended && (
          <div className="mt-4 flex items-start gap-3 border-l-2 border-outline-variant px-4 py-1 text-body-medium text-on-surface-variant">
            <Icon name="inventory_2" className="shrink-0" />
            {endedLine(rel, me.user.id, memberName)}
          </div>
        )}

        {(isDom || dates.length > 0) && (
          <>
            <Label>Dates</Label>
            <Group>
              {dates.map((d) => (
                <Row
                  key={d.id}
                  headline={d.label}
                  trailing={<span className="shrink-0 text-right text-body-medium text-on-surface-variant">{describeDate(d.date, now)}</span>}
                  onClick={isDom ? () => setEditingDate(d) : undefined}
                />
              ))}
              {isDom && (
                <button
                  type="button"
                  onClick={() => setEditingDate({ id: "", label: "", date: "" })}
                  className="state-layer state-row py-3.5 text-left text-body-large text-primary"
                >
                  Add a date
                </button>
              )}
            </Group>
          </>
        )}

        <BothMoods heading={<Label>Mood, both of you</Label>} />

        {!ended && (
          <>
            <Label>Together</Label>
            <Group>
              {(swapWith || inSwap) && (
                <Row
                  leading={<Icon name="swap_horiz" className="text-on-surface-variant" />}
                  headline={swap?.status === "active" ? "Roles swapped" : swap ? "Swap asked for" : "Swap roles for a while"}
                  supporting={
                    swap?.status === "active"
                      ? swap.endsAt
                        ? `Until ${fmtSwapEnd(swap.endsAt)}`
                        : "Until one of you swaps back"
                      : swap
                        ? swap.requestedBy === me.user.id
                          ? `Waiting for ${memberName(swap.partnerId)} to accept`
                          : `${memberName(swap.requestedBy)} asked; answer on Today`
                        : "Both of you agree first"
                  }
                  onClick={
                    !swap ? () => setSheet("swap") : swap.status === "active" || swap.requestedBy === me.user.id ? () => setSheet("end-swap") : undefined
                  }
                />
              )}
              <Row
                leading={<Icon name="person_add" className="text-on-surface-variant" />}
                headline="Invite someone"
                supporting="Link or code"
                onClick={() => setSheet("invite")}
              />
              <Row
                leading={<Icon name="auto_awesome" className="text-on-surface-variant" />}
                headline="AI access"
                trailing={
                  <span className="flex shrink-0 items-center text-body-medium text-on-surface-variant">
                    {aiAccessState(rel, me.user.id)}
                    <Icon name="chevron_right" />
                  </span>
                }
                onClick={() => navigate({ to: "/dynamic/ai" })}
              />
            </Group>
          </>
        )}
        <Label>People</Label>
        <Group>
          <Row
            leading={<Icon name="group" className="text-on-surface-variant" />}
            headline={rel.members.map((m) => (m.userId === me.user.id ? "You" : m.displayName)).join(", ")}
            trailing={<Icon name="chevron_right" className="text-on-surface-variant" />}
            onClick={() => navigate({ to: "/dynamic/people" })}
          />
          <Row
            headline="How it works"
            trailing={<Icon name="chevron_right" className="text-on-surface-variant" />}
            onClick={() => navigate({ to: "/dynamic/how" })}
          />
          {ended && rel.members.some((m) => m.userId === me.user.id && m.aiAccess) && (
            <Row
              headline="AI access"
              trailing={<Icon name="chevron_right" className="text-on-surface-variant" />}
              onClick={() => navigate({ to: "/dynamic/ai" })}
            />
          )}
        </Group>

      </div>

      <InviteSheet open={sheet === "invite"} onClose={() => setSheet(null)} />
      <SwapDialog open={sheet === "swap"} onClose={() => setSheet(null)} />
      {swap && <EndSwapDialog open={sheet === "end-swap"} onClose={() => setSheet(null)} swap={swap} />}
      <DateDialog
        value={editingDate}
        onClose={() => setEditingDate(null)}
        onSave={(d) => {
          const exists = (rel.dates ?? []).some((x) => x.id === d.id);
          saveDates(exists ? (rel.dates ?? []).map((x) => (x.id === d.id ? d : x)) : [...(rel.dates ?? []), { ...d, id: crypto.randomUUID() }], "Date saved");
        }}
        onDelete={(id) =>
          saveDates(
            (rel.dates ?? []).filter((x) => x.id !== id),
            "Date removed",
          )
        }
      />
    </div>
  );
}

/** The top line: back to Us, and inviting someone. */
function TopBar({ back, onInvite, label = "Us" }: { back(): void; onInvite?: () => void; label?: string }) {
  return (
    <div className="flex min-h-10 items-center gap-1 px-4 pt-3 md:px-6 md:pt-6">
      <div className="min-w-0 flex-1">
        <BackLink label={label} onClick={back} />
      </div>
      {onInvite && <IconButton icon="person_add" label="Invite someone" onClick={onInvite} />}
    </div>
  );
}

/** "Sir leads · Kitten is the submissive"; a switch "switches". */
export function whoLeads(members: Member[]) {
  return members
    .map((m) =>
      m.role === "dominant" ? `${m.displayName} leads` : m.role === "submissive" ? `${m.displayName} is the submissive` : `${m.displayName} switches`,
    )
    .join(" · ");
}

/** Everyone's mood over the last month as one line each; the submissive's in ink, the others dashed. */
function BothMoods({ heading }: { heading: ReactNode }) {
  const { rel, me, memberName } = useRel();
  const moods = useMoods(rel.id, 30);
  const list = moods.data ?? [];
  if (!list.length) return null;
  const people = [...new Set(list.map((m) => m.userId))].sort((a, b) => {
    const r = (id: string) => (rel.members.find((m) => m.userId === id)?.role === "submissive" ? 0 : 1);
    return r(a) - r(b);
  });
  const W = 600;
  const Hh = 90;
  const end = Date.now();
  const start = end - 30 * 86_400_000;
  const x = (iso: string) => ((new Date(iso).getTime() - start) / (end - start)) * W;
  const y = (m: number) => 6 + ((5 - m) / 4) * (Hh - 12);
  return (
    <>
      {heading}
      <svg viewBox={`0 0 ${W} ${Hh}`} preserveAspectRatio="none" className="mt-3 block h-[90px] w-full" role="img" aria-label="Mood over the last 30 days">
        {people.map((id, i) => {
          const pts = list.filter((m) => m.userId === id).sort((a, b) => a.at.localeCompare(b.at));
          const d = pts.map((p, j) => `${j ? "L" : "M"}${x(p.at).toFixed(1)},${y(p.mood).toFixed(1)}`).join(" ");
          return (
            <path
              key={id}
              d={pts.length > 1 ? d : `M0,${y(pts[0]!.mood)} L${W},${y(pts[0]!.mood)}`}
              fill="none"
              vectorEffect="non-scaling-stroke"
              strokeWidth={i ? 1.75 : 2}
              strokeDasharray={i ? "5 4" : undefined}
              className={i ? "stroke-primary" : "stroke-on-surface"}
              strokeLinejoin="round"
            />
          );
        })}
      </svg>
      {
        <div className="mt-2 flex gap-5 text-body-small text-on-surface-variant">
          {people.map((id, i) => (
            <span key={id} className="flex items-center gap-2">
              <span className={cx("inline-block w-5 border-t-2", i ? "border-dashed border-primary" : "border-on-surface")} />
              {id === me.user.id ? "You" : memberName(id)}
            </span>
          ))}
        </div>
      }
    </>
  );
}

/** Who's in it, inviting, other dynamics, and leaving or blocking. Opened from Your dynamic. */
export function PeoplePage() {
  const { me, rel, select } = useRel();
  const navigate = useNavigate();
  const back = useBack(() => navigate({ to: "/dynamic" }));
  const [invite, setInvite] = useState(false);
  const [reporting, setReporting] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<{ target: Member | null } | null>(null);
  const ended = rel.endedAt !== null;
  const others = rel.members.filter((m) => m.userId !== me.user.id);
  return (
    <div className="flex flex-col pb-10">
      <div className="mx-auto w-full max-w-2xl"><SubHeader title="People" back="Your dynamic" onBack={back} /></div>
      <div className="mx-auto w-full max-w-2xl px-4 md:px-6">
        <Group>
          {rel.members.map((m) => (
            <Row
              key={m.userId}
              leading={<Avatar userId={m.userId} name={m.displayName} version={m.avatarVersion} size={44} serif collared={isCollared(rel, m.userId)} />}
              headline={m.displayName}
              supporting={m.userId === me.user.id ? `${ROLE_LABEL[m.role]} · you` : ROLE_LABEL[m.role]}
              trailing={
                m.userId !== me.user.id && (
                  <button type="button" onClick={() => setReporting(m.userId)} className="state-layer rounded-sm px-1 py-1 text-body-large text-primary">
                    Report
                  </button>
                )
              }
            />
          ))}
        </Group>
        {!ended && (
          <Button variant="outlined" icon="person_add" className="mt-5 h-14! w-full" onClick={() => setInvite(true)}>
            Invite someone
          </Button>
        )}

        <Label>Other dynamics</Label>
        <Group>
          {me.relationships
            .filter((r) => r.id !== rel.id)
            .map((r) => (
              <Row
                key={r.id}
                headline={relTitle(r, me.user.id)}
                trailing={<Icon name="chevron_right" className="text-on-surface-variant" />}
                onClick={() => {
                  select(r.id);
                  void navigate({ to: "/" });
                }}
              />
            ))}
          <button type="button" onClick={() => void navigate({ to: "/onboarding" })} className="state-layer state-row py-3.5 text-left text-body-large text-primary">
            Join or start another
          </button>
        </Group>

        <Label>{ended ? "Blocking" : "Leaving"}</Label>
        <p className="pt-1 text-body-large text-on-surface-variant">
          {ended
            ? "Blocking stops them pairing with you again."
            : "Leaving or blocking ends this dynamic for everyone in it. You each keep a read-only copy. Proof photos are deleted."}
        </p>
        <div className="mt-4 flex gap-3">
          {!ended && (
            <Button variant="outlined" onClick={() => setLeaving({ target: null })}>
              Leave
            </Button>
          )}
          {others.map((m) => (
            <Button key={m.userId} variant="outlined" className="border-error! text-error" onClick={() => setLeaving({ target: m })}>
              {others.length > 1 ? `Block ${m.displayName}` : "Block"}
            </Button>
          ))}
        </div>
      </div>
      {reporting && <ReportDialog subjectId={reporting} onClose={() => setReporting(null)} />}
      {leaving && <LeaveDialog target={leaving.target} onClose={() => setLeaving(null)} />}
      <InviteSheet open={invite} onClose={() => setInvite(false)} />
    </div>
  );
}

/** "Sam ended this dynamic on Oct 20. It's kept here, read-only." */
export function endedLine(rel: Relationship, myId: string, memberName: (id: string | null) => string) {
  const who = rel.endedBy === myId ? "You" : rel.endedBy ? memberName(rel.endedBy) : "Someone";
  const on = fmtDate(localDateOf(new Date(rel.endedAt!)), { month: "short", day: "numeric", year: "numeric" });
  return `${who} ended this dynamic on ${on}. It's kept here so you can look back, but nothing in it can change.`;
}

/**
 * Leaving ends the dynamic for both (Jake's "archive for both"). Blocking one person does the same and stops that
 * person pairing with you again; it still works on a dynamic that already ended.
 */
function LeaveDialog({ target, onClose }: { target: Member | null; onClose(): void }) {
  const { rel, partners } = useRel();
  const snack = useSnackbar();
  const leave = useLeaveRelationship(rel.id);
  const [block, setBlock] = useState<string[]>(target ? [target.userId] : []);
  const ended = rel.endedAt !== null;
  const toggle = (id: string, on: boolean) => setBlock((b) => (on ? [...b, id] : b.filter((x) => x !== id)));
  return (
    <Dialog
      open
      onClose={onClose}
      title={target ? (ended ? `Block ${target.displayName}?` : `Block ${target.displayName} and end this dynamic?`) : "Leave this dynamic?"}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            busy={leave.isPending}
            onClick={() =>
              leave.mutate(block, {
                onSuccess: () => {
                  onClose();
                  snack(target ? `Blocked ${target.displayName}` : "You left the dynamic");
                },
                onError: (e) => snack(errorMessage(e)),
              })
            }
          >
            {target ? "Block" : "Leave"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {!ended && (
          <p>
            This ends the dynamic for everyone in it. You each keep a read-only copy of its tasks, notes and history. Open tasks are cancelled and proof photos
            are deleted.
          </p>
        )}
        {target ? (
          <p>{target.displayName} won't be able to pair with you again. They aren't told you blocked them.</p>
        ) : (
          partners.map((p) => (
            <Checkbox
              key={p.userId}
              checked={block.includes(p.userId)}
              onChange={(on) => toggle(p.userId, on)}
              label={`Also block ${p.displayName}, so they can't pair with you again`}
            />
          ))
        )}
      </div>
    </Dialog>
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
              <Button icon="share" onClick={() => navigator.share({ title: "Join me on Fealty", url: link }).catch(() => {})}>
                Share
              </Button>
            )}
          </>
        ) : (
          <>
            <Button variant="text" onClick={onClose}>
              Cancel
            </Button>
            <Button
              icon="add_link"
              busy={create.isPending}
              onClick={() => create.mutate(role, { onSuccess: setInvite, onError: (e) => snack(errorMessage(e)) })}
            >
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

/** Rules for the app itself: the name, who moves deadlines, sub notes and how long proof photos stay. Opened from Your dynamic (mockup 87). */
/** Hourly from noon to 11 PM, plus whatever is stored if it's off the hour. */
function anytimeTimes(current: string) {
  const hours = Array.from({ length: 12 }, (_, i) => `${String(12 + i).padStart(2, "0")}:00`);
  return hours.includes(current) ? hours : [...hours, current].sort();
}

export function HowItWorksPage() {
  const { rel, me, isDom: dom, memberName } = useRel();
  const isDom = dom && rel.endedAt === null;
  const navigate = useNavigate();
  const snack = useSnackbar();
  const update = useUpdateRelationship(rel.id);
  const back = useBack(() => navigate({ to: "/dynamic" }));
  const [naming, setNaming] = useState(false);
  const [allowance, setAllowance] = useState(String(rel.weeklyDelayAllowance));
  useEffect(() => setAllowance(String(rel.weeklyDelayAllowance)), [rel.weeklyDelayAllowance]);
  const patch = (body: Parameters<typeof update.mutate>[0], msg = "Saved") =>
    update.mutate(body, { onSuccess: () => snack(msg), onError: (e) => snack(errorMessage(e)) });
  const sub = rel.members.find((m) => m.role === "submissive");
  const subName = sub?.displayName ?? "The submissive";
  const partner = rel.members.find((m) => m.userId !== me.user.id);
  const options: { value: ReschedulePolicy; label: string; supporting?: string }[] = [
    { value: "dominant_only", label: "Dominant only" },
    { value: "request", label: `${subName} may ask`, supporting: isDom ? "You approve or decline" : "A Dominant approves or declines" },
    { value: "allowance", label: "Weekly allowance", supporting: "Free delays each week, more need a yes" },
  ];
  const saveAllowance = () => {
    const n = Math.max(0, Math.min(50, Math.trunc(Number(allowance) || 0)));
    if (n !== rel.weeklyDelayAllowance) patch({ reschedulePolicy: "allowance", weeklyDelayAllowance: n });
  };
  return (
    <div className="flex flex-col pb-10">
      <div className="mx-auto w-full max-w-2xl"><SubHeader title="How it works" back="Your dynamic" onBack={back} /></div>
      <div className="mx-auto w-full max-w-2xl px-4 md:px-6">
        {!isDom && <p className="-mt-2 text-body-medium text-on-surface-variant">{rel.endedAt ? "This dynamic has ended, so nothing here can change." : "Only a Dominant changes these."}</p>}
        <Group>
          <Row
            headline="Name"
            supporting={rel.name ?? `None set, so it shows ${partner ? memberName(partner.userId) : "your partner's name"}`}
            trailing={isDom && <Icon name="edit" className="text-on-surface-variant" />}
            onClick={isDom ? () => setNaming(true) : undefined}
          />
        </Group>
        <Label>Moving deadlines</Label>
        <Group>
          {options.map((o) => (
            <Row
              key={o.value}
              leading={<Diamond state={rel.reschedulePolicy === o.value ? "done" : "open"} className="mx-1" />}
              headline={o.label}
              supporting={o.supporting}
              onClick={isDom && rel.reschedulePolicy !== o.value ? () => patch({ reschedulePolicy: o.value }) : undefined}
            />
          ))}
          {rel.reschedulePolicy === "allowance" && (
            <div className="py-3">
              <TextField
                label="Free delays per week"
                type="number"
                min={0}
                max={50}
                value={allowance}
                disabled={!isDom}
                onChange={(e) => setAllowance(e.target.value)}
                onBlur={saveAllowance}
              />
            </div>
          )}
        </Group>
        <Label>Reminders</Label>
        <Group>
          <div className="pt-3 pb-4">
            <Select
              label="Tasks with no time"
              value={rel.anytimeReminder}
              disabled={!isDom}
              onChange={(e) => patch({ anytimeReminder: e.target.value }, `Reminded at ${fmtClock(e.target.value)}`)}
            >
              {anytimeTimes(rel.anytimeReminder).map((t) => (
                <option key={t} value={t}>
                  {fmtClock(t)}
                </option>
              ))}
            </Select>
          </div>
        </Group>
        <Label>Notes</Label>
        <Group>
          <div className="py-1">
            <Switch
              checked={rel.subNotes}
              onChange={(on) => isDom && patch({ subNotes: on }, on ? "Notes turned on for them" : "Notes turned off for them")}
              label={`${subName} can write their own notes`}
            />
          </div>
        </Group>
        <Label>Proof photos</Label>
        <Group>
          <div className="pt-3 pb-4">
            <Select
              label="Keep them"
              value={rel.proofDays === null ? "" : String(rel.proofDays)}
              disabled={!!rel.endedAt}
              onChange={(e) => {
                const days = e.target.value ? Number(e.target.value) : null;
                patch(
                  { proofDays: days },
                  days ? `Proof photos are deleted ${PROOF_DAYS.find((d) => d.value === days)?.label.toLowerCase()}` : "Proof photos are kept",
                );
              }}
              help="A photo that's been reported stays until it's reviewed."
            >
              <option value="">Until you delete them</option>
              {PROOF_DAYS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </Select>
          </div>
        </Group>
      </div>
      <NameDialog open={naming} onClose={() => setNaming(false)} onSave={(name) => patch({ name }, "Name saved")} />
    </div>
  );
}
