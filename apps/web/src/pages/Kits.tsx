import { useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { starterKits, type ApplyKitResult, type Features, type Kit, type KitItem } from "@obey/contracts";
import { describe } from "@obey/recurrence";
import { useApplyKit, useCopySharedKit, useDeleteKit, useLibrary, useMyKits, useSaveKit, useShareKit, useSharedKit, useTasks, useUpdateKit } from "../api/hooks";
import { errorMessage } from "../api/client";
import { Button, Card, Checkbox, Dialog, Empty, ErrorBox, Icon, Loading, OverflowMenu, PageHeader, Select, TextField, useSnackbar } from "../components/ui";
import { browserTimeZone, fmtClock, fmtDate, today } from "../lib/dates";
import { useReadOnly, useRel } from "../lib/relationship";
import { useConfirm } from "../lib/useConfirm";

/** What a kit shows as and adds from: a starter kit, one of your own, or one someone shared. */
type KitLike = { title: string; description: string; items: KitItem[] };
type KitSource = { kit: string } | { shared: string };

const KIND: Record<KitItem["kind"], { icon: string; label: string }> = {
  task: { icon: "task_alt", label: "Task" },
  rule: { icon: "gavel", label: "Rule" },
  protocol: { icon: "description", label: "Protocol" },
  reward: { icon: "redeem", label: "Reward" },
  consequence: { icon: "report", label: "Consequence" },
};
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR"];

/** "Every day by 9:00 AM · 5 points · photo proof · Write lines if missed"; rules, rewards and the rest say what they are. */
export function kitItemSummary(i: KitItem, all: KitItem[] = []) {
  const title = (key?: string) => all.find((x) => x.key === key)?.title;
  if (i.kind === "rule") {
    const n = all.filter((p) => p.ruleKey === i.key).length;
    return n ? `Rule · with ${plural(n, "protocol")}` : "Rule";
  }
  if (i.kind === "protocol") return title(i.ruleKey) ? `Protocol for “${title(i.ruleKey)}”` : "Protocol";
  if (i.kind === "reward") return `Reward · ${plural(i.cost ?? 0, "point")}`;
  if (i.kind === "consequence") return "Consequence";
  const r = i.repeat;
  const when = !r
    ? "Once"
    : r.freq === "daily" && (r.interval ?? 1) === 1
      ? "Every day"
      : r.freq === "weekly" && (r.interval ?? 1) === 1 && r.byWeekday?.length === 5 && WEEKDAYS.every((d) => r.byWeekday!.includes(d as never))
        ? "Weekdays"
        : describe({ start: today(), rule: r, anchor: i.anchor });
  return [
    i.dueTime ? `${when} by ${fmtClock(i.dueTime)}` : when,
    i.points ? plural(i.points, "point") : null,
    i.proofRequired ? "photo proof" : null,
    i.steps?.length ? plural(i.steps.length, "step") : null,
    title(i.consequenceKey) ? `${title(i.consequenceKey)} if missed` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Only what this dynamic has switched on: rules, protocols, rewards and consequences each have a feature. */
function usable(items: KitItem[], features: Features) {
  const on = (i: KitItem) =>
    i.kind === "task" || (i.kind === "rule" ? features.rules : i.kind === "protocol" ? features.protocols : i.kind === "reward" ? features.points : features.consequences);
  // A task whose reward or consequence is switched off still comes; it just won't point at one.
  return items.filter(on);
}

/** Starter kits with what this dynamic can use. */
export function useKits() {
  const { features } = useRel();
  return starterKits.map((k) => ({ ...k, items: usable(k.items, features) })).filter((k) => k.items.length);
}

function KitCard({ icon, kit, shared, onClick }: { icon: string; kit: KitLike; shared?: boolean; onClick(): void }) {
  const titles = kit.items.map((i) => (i.kind === "reward" ? `Reward: ${i.title}` : i.title));
  return (
    <Card variant="elevated" onClick={onClick}>
      <div className="flex items-start gap-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-secondary-container text-on-secondary-container">
          <Icon name={icon} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-title-medium text-on-surface">
            {kit.title}
            {shared && (
              <span className="inline-flex h-6 items-center gap-1 rounded-sm bg-tertiary-container px-2 text-label-medium text-on-tertiary-container">
                <Icon name="link" size={16} />
                Shared
              </span>
            )}
          </div>
          {kit.description && <div className="text-body-medium text-on-surface-variant">{kit.description}</div>}
          <div className="mt-2 text-label-medium text-on-surface-variant">
            {titles.slice(0, 4).join(" · ")}
            {titles.length > 4 && ` · ${titles.length - 4} more`}
          </div>
        </div>
      </div>
    </Card>
  );
}

const noKits = <Empty icon="widgets" title="Kits" body="Your Dominant can add ready-made tasks and rules from here." />;

/** Your own kits, then the starter kits; a Dominant adds what they pick to the dynamic, and everything stays editable afterwards. */
export function KitsPage() {
  const { isDom } = useRel();
  const readOnly = useReadOnly();
  const kits = useKits();
  const mine = useMyKits(isDom && !readOnly);
  const navigate = useNavigate();
  const [open, setOpen] = useState<(typeof kits)[number] | null>(null);
  const [adding, setAdding] = useState(false);
  if (!isDom || readOnly) return noKits;
  return (
    <>
      <PageHeader title="Kits" subtitle="Sets of tasks, rules and rewards you can add to any dynamic." />
      <div className="flex flex-wrap gap-2 px-4 pb-4 md:px-6">
        <Button icon="add" onClick={() => navigate({ to: "/kits/new" })}>
          New kit
        </Button>
        <Button variant="outlined" icon="download" onClick={() => setAdding(true)}>
          Add from a link
        </Button>
      </div>
      {mine.data && mine.data.length > 0 && (
        <>
          <h2 className="px-4 pt-2 pb-2 text-title-small text-primary md:px-6">Your kits</h2>
          <div className="grid gap-3 px-4 pb-6 sm:grid-cols-2 md:px-6">
            {mine.data.map((k) => (
              <KitCard key={k.id} icon="widgets" kit={k} shared={!!k.shareCode} onClick={() => navigate({ to: "/kits/$kitId", params: { kitId: k.id } })} />
            ))}
          </div>
        </>
      )}
      <h2 className="px-4 pt-2 pb-2 text-title-small text-primary md:px-6">Starter kits</h2>
      <div className="grid gap-3 px-4 pb-24 sm:grid-cols-2 md:px-6">
        {kits.map((k) => (
          <KitCard key={k.id} icon={k.icon} kit={k} onClick={() => setOpen(k)} />
        ))}
      </div>
      {open && <KitDialog kit={open} source={{ kit: open.id }} onClose={() => setOpen(null)} />}
      {adding && <AddByCodeDialog onClose={() => setAdding(false)} />}
    </>
  );
}

/** A share link or its code: `…/kit/7KQM2P`, `7KQ-M2P` or `7kqm2p`. */
const shareCodeFrom = (text: string) => {
  const m = /(?:\/kit\/)?([A-Za-z0-9]{3}-?[A-Za-z0-9]{3})\/?\s*$/.exec(text.trim());
  return m ? m[1]!.replace("-", "").toUpperCase() : null;
};
export const kitLink = (code: string) => `${window.location.origin}/kit/${code}`;
const dashed = (code: string) => `${code.slice(0, 3)}-${code.slice(3)}`;

function AddByCodeDialog({ onClose }: { onClose(): void }) {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const code = shareCodeFrom(text);
  const go = () => code && void navigate({ to: "/kit/$code", params: { code } });
  return (
    <Dialog
      open
      onClose={onClose}
      title="Add a shared kit"
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!code} onClick={go}>
            Open
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
      >
        <TextField label="Link or code" value={text} onChange={(e) => setText(e.target.value)} help="Ask whoever shared it for the link or the 6-letter code." />
      </form>
    </Dialog>
  );
}

/** "Added 3 tasks, 1 rule" */
function addedText(r: ApplyKitResult) {
  const parts = [
    r.tasks && plural(r.tasks, "task"),
    r.rules && plural(r.rules, "rule"),
    r.protocols && plural(r.protocols, "protocol"),
    r.rewards && plural(r.rewards, "reward"),
    r.consequences && plural(r.consequences, "consequence"),
  ].filter(Boolean);
  return `Added ${parts.join(", ")}`;
}

export function KitDialog({ kit, source, onClose, onApplied }: { kit: KitLike; source: KitSource; onClose(): void; onApplied?: () => void }) {
  const { rel, me, partners, features } = useRel();
  const navigate = useNavigate();
  const snack = useSnackbar();
  const apply = useApplyKit(rel.id);
  const items = usable(kit.items, features);
  const [picked, setPicked] = useState(() => new Set(items.map((i) => i.key)));
  const people = [...partners.filter((p) => p.role === "submissive"), ...partners.filter((p) => p.role !== "submissive"), ...rel.members.filter((m) => m.userId === me.user.id)];
  const [assignee, setAssignee] = useState(people[0]?.userId ?? me.user.id);
  const chosen = items.filter((i) => picked.has(i.key));
  const hasTasks = chosen.some((i) => i.kind === "task");
  const toggle = (i: KitItem, on: boolean) =>
    setPicked((s) => {
      const n = new Set(s);
      if (on) n.add(i.key);
      else n.delete(i.key);
      // A protocol goes with the rule it spells out; a task with its reward and consequence.
      for (const other of items) if (!on && [other.ruleKey, other.consequenceKey, other.rewardKey].includes(i.key)) n.delete(other.key);
      if (on) for (const k of [i.ruleKey, i.consequenceKey, i.rewardKey]) if (k && items.some((x) => x.key === k)) n.add(k);
      return n;
    });

  const submit = () =>
    apply.mutate(
      { ...source, items: chosen.map((i) => i.key), assigneeId: hasTasks ? assignee : undefined, timezone: browserTimeZone(), start: today() },
      {
        onSuccess: (r) => {
          snack(r.drafts ? `${addedText(r)}. Look them over, then send` : addedText(r));
          onClose();
          onApplied?.();
          void navigate({ to: r.tasks ? "/tasks" : r.rules ? "/rules" : r.protocols ? "/protocols" : r.rewards ? "/rewards" : "/consequences" });
        },
        onError: (e) => snack(errorMessage(e)),
      },
    );

  return (
    <Dialog
      open
      onClose={onClose}
      title={kit.title}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} busy={apply.isPending} disabled={!chosen.length}>
            Add {chosen.length || ""}
          </Button>
        </>
      }
    >
      <p className="mb-3">{kit.description ? `${kit.description} ` : ""}Untick anything you don't want.</p>
      <div className="flex flex-col">
        {items.map((i) => (
          <Checkbox
            key={i.key}
            checked={picked.has(i.key)}
            onChange={(v) => toggle(i, v)}
            label={
              <span className="flex flex-col py-1">
                <span className="text-body-large text-on-surface">{i.title}</span>
                <span className="text-body-small text-on-surface-variant">{kitItemSummary(i, items)}</span>
              </span>
            }
          />
        ))}
      </div>
      {hasTasks && (
        <Select label="Tasks are for" value={assignee} onChange={(e) => setAssignee(e.target.value)} className="mt-4">
          {people.map((p) => (
            <option key={p.userId} value={p.userId}>
              {p.userId === me.user.id ? "Me" : p.displayName}
            </option>
          ))}
        </Select>
      )}
      {hasTasks && !partners.length && <p className="mt-2 text-body-small">Your partner hasn't joined yet, so tasks would be yours. You can reassign them later.</p>}
    </Dialog>
  );
}

function ItemList({ items }: { items: KitItem[] }) {
  return (
    <div className="mx-4 overflow-hidden rounded-lg bg-surface-container-low md:mx-6">
      {items.map((i) => (
        <div key={i.key} className="flex items-center gap-4 border-t border-surface-container-highest px-4 py-3 first:border-t-0">
          <Icon name={KIND[i.kind].icon} className="text-on-surface-variant" />
          <div className="min-w-0 flex-1">
            <div className="text-body-large text-on-surface">{i.title}</div>
            <div className="text-body-medium text-on-surface-variant">{kitItemSummary(i, items)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Tasks first, then rules with their protocols, then rewards and consequences. */
const ORDER: KitItem["kind"][] = ["task", "rule", "protocol", "reward", "consequence"];
const sorted = (items: KitItem[]) => [...items].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));

/** "3 tasks, 2 rules, 1 consequence" */
const counts = (items: KitItem[]) =>
  ORDER.map((k) => [k, items.filter((i) => i.kind === k).length] as const)
    .filter(([, n]) => n)
    .map(([k, n]) => plural(n, KIND[k].label.toLowerCase()))
    .join(", ");

/** One of your own kits: add it, share it, rename or trim it. */
export function KitPage({ kitId }: { kitId: string }) {
  const { isDom } = useRel();
  const readOnly = useReadOnly();
  const mine = useMyKits();
  const navigate = useNavigate();
  const snack = useSnackbar();
  const del = useDeleteKit();
  const [confirm, confirmEl] = useConfirm();
  const [dialog, setDialog] = useState<"add" | "share" | "edit" | null>(null);
  if (mine.error) return <ErrorBox error={mine.error} onRetry={() => void mine.refetch()} />;
  if (!mine.data) return <Loading />;
  const kit = mine.data.find((k) => k.id === kitId);
  if (!kit) return <Empty icon="widgets" title="Kit not found" body="It may have been deleted." />;
  const items = sorted(kit.items);
  return (
    <>
      <PageHeader title={kit.title} subtitle={kit.description || counts(items)} />
      <div className="flex flex-wrap items-center gap-2 px-4 pb-4 md:px-6">
        {isDom && !readOnly && (
          <Button icon="add" onClick={() => setDialog("add")}>
            Add to this dynamic
          </Button>
        )}
        <Button variant="tonal" icon="share" onClick={() => setDialog("share")}>
          Share
        </Button>
        <span className="flex-1" />
        <OverflowMenu
          items={[
            { label: "Edit", icon: "edit", onClick: () => setDialog("edit") },
            {
              label: "Delete",
              icon: "delete",
              danger: true,
              onClick: () =>
                confirm(`Delete “${kit.title}”?`, () =>
                  del.mutate(kit.id, {
                    onSuccess: () => {
                      snack("Kit deleted");
                      void navigate({ to: "/kits" });
                    },
                    onError: (e) => snack(errorMessage(e)),
                  }),
                ),
            },
          ]}
        />
      </div>
      <ItemList items={items} />
      <p className="px-4 pt-3 pb-24 text-body-small text-on-surface-variant md:px-6">
        Saved {fmtDate(kit.createdAt.slice(0, 10))}. Only you see your kits. It's a copy: changing a task later doesn't change the kit.
      </p>
      {dialog === "add" && <KitDialog kit={kit} source={{ kit: kit.id }} onClose={() => setDialog(null)} />}
      {dialog === "share" && <ShareDialog kit={kit} onClose={() => setDialog(null)} />}
      {dialog === "edit" && <EditKitDialog kit={kit} onClose={() => setDialog(null)} />}
      {confirmEl}
    </>
  );
}

function ShareDialog({ kit, onClose }: { kit: Kit; onClose(): void }) {
  const share = useShareKit();
  const snack = useSnackbar();
  const [code, setCode] = useState(kit.shareCode);
  const turn = (on: boolean) => share.mutate({ id: kit.id, on }, { onSuccess: (k) => (setCode(k.shareCode), on || onClose()), onError: (e) => snack(errorMessage(e)) });
  const link = code ? kitLink(code) : null;
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Share “${kit.title}”`}
      actions={
        link ? (
          <>
            <Button variant="text" className="mr-auto text-error" busy={share.isPending} onClick={() => turn(false)}>
              Stop sharing
            </Button>
            {"share" in navigator ? (
              <Button icon="share" onClick={() => navigator.share({ title: kit.title, url: link }).catch(() => {})}>
                Send link
              </Button>
            ) : (
              <Button onClick={onClose}>Done</Button>
            )}
          </>
        ) : (
          <>
            <Button variant="text" onClick={onClose}>
              Cancel
            </Button>
            <Button icon="add_link" busy={share.isPending} onClick={() => turn(true)}>
              Create link
            </Button>
          </>
        )
      }
    >
      <p>Anyone with the link can see this kit and save a copy. They don't see your name, your dynamic, or who the tasks were for.</p>
      {link && (
        <>
          <button
            type="button"
            className="state-layer mt-4 flex w-full items-center gap-3 rounded-sm border border-outline px-4 py-3 text-left"
            onClick={() =>
              navigator.clipboard?.writeText(link).then(
                () => snack("Link copied"),
                () => snack("Couldn't copy"),
              )
            }
          >
            <span className="min-w-0 flex-1 text-body-large break-all text-on-surface">{link.replace(/^https?:\/\//, "")}</span>
            <Icon name="content_copy" className="text-primary" />
          </button>
          <p className="mt-3">
            Or give them the code <b className="tracking-wider text-on-surface">{dashed(code!)}</b> to enter under “Add from a link”.
          </p>
          <p className="mt-3 text-body-small">Changes you make to the kit show up for anyone who opens the link later. Copies already saved stay as they were.</p>
        </>
      )}
    </Dialog>
  );
}

function EditKitDialog({ kit, onClose }: { kit: Kit; onClose(): void }) {
  const update = useUpdateKit();
  const snack = useSnackbar();
  const [title, setTitle] = useState(kit.title);
  const [description, setDescription] = useState(kit.description);
  const [keep, setKeep] = useState(() => new Set(kit.items.map((i) => i.key)));
  const items = sorted(kit.items);
  const save = () =>
    update.mutate({ id: kit.id, title: title.trim(), description: description.trim(), keep: [...keep] }, { onSuccess: onClose, onError: (e) => snack(errorMessage(e)) });
  return (
    <Dialog
      open
      onClose={onClose}
      title="Edit kit"
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={update.isPending} disabled={!title.trim() || !keep.size} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField label="Name" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} />
        <TextField label="Description (optional)" value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <p className="mt-4 mb-1">Untick anything to take out of the kit.</p>
      {items.map((i) => (
        <Checkbox
          key={i.key}
          checked={keep.has(i.key)}
          onChange={(v) =>
            setKeep((s) => {
              const n = new Set(s);
              if (v) n.add(i.key);
              else n.delete(i.key);
              return n;
            })
          }
          label={
            <span className="flex flex-col py-1">
              <span className="text-body-large text-on-surface">{i.title}</span>
              <span className="text-body-small text-on-surface-variant">{kitItemSummary(i, items)}</span>
            </span>
          }
        />
      ))}
    </Dialog>
  );
}

/** Pick from what this dynamic already has; the kit is a copy. */
export function NewKitPage() {
  const { rel, isDom, features } = useRel();
  const readOnly = useReadOnly();
  const navigate = useNavigate();
  const snack = useSnackbar();
  const save = useSaveKit(rel.id);
  const tasks = useTasks(rel.id);
  const rules = useLibrary(rel.id, "rules", features.rules);
  const protocols = useLibrary(rel.id, "protocols", features.protocols);
  const rewards = useLibrary(rel.id, "rewards", features.points);
  const consequences = useLibrary(rel.id, "consequences", features.consequences);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  if (!isDom || readOnly) return noKits;
  if (tasks.error) return <ErrorBox error={tasks.error} onRetry={() => void tasks.refetch()} />;
  if (!tasks.data) return <Loading />;

  const usableTasks = tasks.data.filter((t) => t.active && !t.draft && !t.assignedConsequenceId);
  const pickedTasks = usableTasks.filter((t) => picked.has(t.id));
  // What comes along without being ticked: a task's reward and consequence, a rule's protocols.
  const along = new Map<string, string>();
  for (const t of pickedTasks) {
    if (t.consequenceId) along.set(t.consequenceId, `Comes with ${t.title}`);
    if (t.rewardId) along.set(t.rewardId, `Comes with ${t.title}`);
  }
  for (const p of protocols.data ?? []) if (p.ruleId && picked.has(p.ruleId)) along.set(p.id, "Comes with its rule");
  const name = (list: { id: string; title: string }[] | undefined, id: string | null) => list?.find((x) => x.id === id)?.title;
  const ids = (list: { id: string }[] | undefined) => (list ?? []).filter((x) => picked.has(x.id)).map((x) => x.id);
  const total = picked.size + [...along.keys()].filter((k) => !picked.has(k)).length;

  const toggle = (id: string, on: boolean) =>
    setPicked((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  const row = (id: string, headline: string, supporting: string, tie?: string) => {
    const forced = along.get(id);
    return (
      <Checkbox
        key={id}
        checked={picked.has(id) || !!forced}
        onChange={(v) => !forced && toggle(id, v)}
        label={
          <span className="flex flex-col py-1">
            <span className="text-body-large text-on-surface">{headline}</span>
            <span className="text-body-small text-on-surface-variant">{forced ?? supporting}</span>
            {tie && picked.has(id) && (
              <span className="flex items-center gap-1 text-body-small text-on-surface-variant">
                <Icon name="link" size={16} />
                {tie}
              </span>
            )}
          </span>
        }
      />
    );
  };
  const group = (label: string, rows: ReactNode[]) =>
    rows.length > 0 && (
      <div key={label}>
        <div className="mt-4 text-label-medium tracking-wider text-on-surface-variant uppercase">{label}</div>
        {rows}
      </div>
    );

  const submit = () =>
    save.mutate(
      {
        title: title.trim(),
        description: description.trim(),
        tasks: pickedTasks.map((t) => t.id),
        rules: ids(rules.data),
        protocols: ids(protocols.data),
        rewards: ids(rewards.data),
        consequences: ids(consequences.data),
      },
      {
        onSuccess: (k) => {
          snack("Kit saved");
          void navigate({ to: "/kits/$kitId", params: { kitId: k.id }, replace: true });
        },
        onError: (e) => snack(errorMessage(e)),
      },
    );

  return (
    <>
      <PageHeader
        title="New kit"
        actions={
          <Button busy={save.isPending} disabled={!title.trim() || !total} onClick={submit}>
            Save
          </Button>
        }
      />
      <div className="flex max-w-2xl flex-col gap-4 px-4 pb-24 md:px-6">
        <TextField label="Name" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder="Weeknight routine" />
        <TextField label="Description (optional)" value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} />
        <p className="text-body-medium text-on-surface-variant">Pick what goes in. The kit is a copy: changing a task later doesn't change the kit.</p>
        <div>
          {group(
            "Tasks",
            usableTasks.map((t) =>
              row(
                t.id,
                t.title,
                [t.summary, t.dueTime && `by ${fmtClock(t.dueTime)}`, t.placeId && "its place isn't copied"].filter(Boolean).join(" · "),
                t.consequenceId ? `Brings its consequence: ${name(consequences.data, t.consequenceId) ?? "the consequence"}` : undefined,
              ),
            ),
          )}
          {group(
            "Rules",
            (rules.data ?? []).map((r) => {
              const n = (protocols.data ?? []).filter((p) => p.ruleId === r.id).length;
              return row(r.id, r.title, n ? `Rule · with ${plural(n, "protocol")}` : "Rule");
            }),
          )}
          {group(
            "Protocols",
            (protocols.data ?? []).map((p) => row(p.id, p.title, "Protocol")),
          )}
          {group(
            "Rewards",
            (rewards.data ?? []).map((r) => row(r.id, r.title, plural(r.cost, "point"))),
          )}
          {group(
            "Consequences",
            (consequences.data ?? []).map((c) => row(c.id, c.title, "Consequence")),
          )}
        </div>
        <p className="flex gap-2 text-body-small text-on-surface-variant">
          <Icon name="info" size={18} />
          <span>Kits keep titles, descriptions, schedules, points, steps and proof settings. They never include who a task is for, places, photos, comments or history.</span>
        </p>
      </div>
    </>
  );
}

/** A kit someone shared: save a copy, or add it straight to this dynamic. */
export function SharedKitPage({ code }: { code: string }) {
  const { isDom } = useRel();
  const readOnly = useReadOnly();
  const kit = useSharedKit(code);
  const copy = useCopySharedKit();
  const navigate = useNavigate();
  const snack = useSnackbar();
  const [adding, setAdding] = useState(false);
  if (kit.error) return <Empty icon="link_off" title="This kit isn't shared any more" body="Ask whoever sent it for a new link." />;
  if (!kit.data) return <Loading />;
  const items = sorted(kit.data.items);
  const canUse = isDom && !readOnly;
  return (
    <>
      <PageHeader title={kit.data.title} subtitle={`A shared kit · ${counts(items)}`} />
      {kit.data.description && <p className="px-4 pb-4 text-body-medium text-on-surface-variant md:px-6">{kit.data.description}</p>}
      <ItemList items={items} />
      <div className="flex flex-wrap gap-2 px-4 pt-4 pb-24 md:px-6">
        <Button
          icon="bookmark_add"
          busy={copy.isPending}
          onClick={() =>
            copy.mutate(code, {
              onSuccess: (k) => {
                snack("Saved to your kits");
                void navigate({ to: "/kits/$kitId", params: { kitId: k.id } });
              },
              onError: (e) => snack(errorMessage(e)),
            })
          }
        >
          Save to your kits
        </Button>
        {canUse && (
          <Button variant="tonal" onClick={() => setAdding(true)}>
            Add to this dynamic
          </Button>
        )}
      </div>
      {adding && <KitDialog kit={kit.data} source={{ shared: code }} onClose={() => setAdding(false)} />}
    </>
  );
}

/** Shown to a Dominant with no tasks yet: a quick way into the kits. */
export function KitPrompt() {
  const { rel, isDom } = useRel();
  const readOnly = useReadOnly();
  const tasks = useTasks(rel.id);
  const navigate = useNavigate();
  if (!isDom || readOnly || !tasks.data || tasks.data.length) return null;
  return (
    <div className="px-4 pb-4 md:px-6">
      <Card variant="outlined">
        <div className="flex items-center gap-4">
          <Icon name="widgets" className="text-primary" />
          <div className="min-w-0 flex-1">
            <div className="text-title-medium text-on-surface">Start from a kit</div>
            <div className="text-body-medium text-on-surface-variant">Ready-made daily tasks and rules you can pick from and edit.</div>
          </div>
          <Button variant="tonal" onClick={() => navigate({ to: "/kits" })}>
            Browse
          </Button>
        </div>
      </Card>
    </div>
  );
}
