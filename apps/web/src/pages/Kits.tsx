import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { starterKits, type KitItem, type StarterKit } from "@obey/contracts";
import { useApplyKit, useTasks } from "../api/hooks";
import { errorMessage } from "../api/client";
import { Button, Card, Checkbox, Dialog, Empty, Icon, PageHeader, Select, useSnackbar } from "../components/ui";
import { browserTimeZone, fmtClock, today } from "../lib/dates";
import { useReadOnly, useRel } from "../lib/relationship";

const DAYS: Record<string, string> = { MO: "Mondays", TU: "Tuesdays", WE: "Wednesdays", TH: "Thursdays", FR: "Fridays", SA: "Saturdays", SU: "Sundays" };

/** "Daily at 9:00 AM", "Every 2 days at 7:00 PM", "Sundays at 6:00 PM"; rules and protocols say what they are. */
export function kitItemSummary(i: KitItem) {
  if (i.kind === "rule") return "Rule";
  if (i.kind === "protocol") return "Protocol";
  const r = i.repeat!;
  const when = r.byWeekday
    ? r.byWeekday.map((d) => DAYS[d]).join(", ")
    : (r.interval ?? 1) > 1
      ? `Every ${r.interval} ${r.freq === "daily" ? "days" : "weeks"}`
      : r.freq === "daily"
        ? "Every day"
        : "Every week";
  return i.dueTime ? `${when} by ${fmtClock(i.dueTime)}` : when;
}

/** The kits and items this dynamic can use: rules and protocols only when those features are on. */
export function useKits() {
  const { features } = useRel();
  return starterKits
    .map((k) => ({ ...k, items: k.items.filter((i) => i.kind === "task" || (i.kind === "rule" ? features.rules : features.protocols)) }))
    .filter((k) => k.items.length);
}

/** Ready-made sets of tasks, rules and protocols a Dominant can start from; everything stays editable afterwards. */
export function KitsPage() {
  const { isDom } = useRel();
  const readOnly = useReadOnly();
  const kits = useKits();
  const [open, setOpen] = useState<StarterKit | null>(null);
  if (!isDom || readOnly) return <Empty icon="widgets" title="Starter kits" body="Your Dominant can add ready-made tasks and rules from here." />;
  return (
    <>
      <PageHeader title="Starter kits" subtitle="Pick a set to start from. You choose what to add, and can edit anything afterwards." />
      <div className="grid gap-3 px-4 pb-24 sm:grid-cols-2 md:px-6">
        {kits.map((k) => (
          <Card key={k.id} variant="elevated" onClick={() => setOpen(k)}>
            <div className="flex items-start gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-secondary-container text-on-secondary-container">
                <Icon name={k.icon} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-title-medium text-on-surface">{k.title}</div>
                <div className="text-body-medium text-on-surface-variant">{k.description}</div>
                <div className="mt-2 text-label-medium text-on-surface-variant">{k.items.map((i) => i.title).join(" · ")}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>
      {open && <KitDialog kit={open} onClose={() => setOpen(null)} />}
    </>
  );
}

export function KitDialog({ kit, onClose, onApplied }: { kit: StarterKit; onClose(): void; onApplied?: () => void }) {
  const { rel, me, partners } = useRel();
  const navigate = useNavigate();
  const snack = useSnackbar();
  const apply = useApplyKit(rel.id);
  const [picked, setPicked] = useState(() => new Set(kit.items.map((i) => i.key)));
  const people = [...partners.filter((p) => p.role === "submissive"), ...partners.filter((p) => p.role !== "submissive"), ...rel.members.filter((m) => m.userId === me.user.id)];
  const [assignee, setAssignee] = useState(people[0]?.userId ?? me.user.id);
  const chosen = kit.items.filter((i) => picked.has(i.key));
  const hasTasks = chosen.some((i) => i.kind === "task");
  const toggle = (i: KitItem, on: boolean) =>
    setPicked((s) => {
      const n = new Set(s);
      if (on) n.add(i.key);
      else n.delete(i.key);
      // A protocol goes with the rule it spells out.
      for (const p of kit.items) if (p.ruleKey === i.key && !on) n.delete(p.key);
      if (on && i.ruleKey) n.add(i.ruleKey);
      return n;
    });

  const submit = () =>
    apply.mutate(
      { kit: kit.id, items: chosen.map((i) => i.key), assigneeId: hasTasks ? assignee : undefined, timezone: browserTimeZone(), start: today() },
      {
        onSuccess: (r) => {
          const parts = [
            r.tasks && `${r.tasks} task${r.tasks === 1 ? "" : "s"}`,
            r.rules && `${r.rules} rule${r.rules === 1 ? "" : "s"}`,
            r.protocols && `${r.protocols} protocol${r.protocols === 1 ? "" : "s"}`,
          ].filter(Boolean);
          snack(`Added ${parts.join(", ")}`);
          onClose();
          onApplied?.();
          void navigate({ to: r.tasks ? "/tasks" : r.rules ? "/rules" : "/protocols" });
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
      <p className="mb-3">{kit.description} Untick anything you don't want.</p>
      <div className="flex flex-col">
        {kit.items.map((i) => (
          <Checkbox
            key={i.key}
            checked={picked.has(i.key)}
            onChange={(v) => toggle(i, v)}
            label={
              <span className="flex flex-col py-1">
                <span className="text-body-large text-on-surface">{i.title}</span>
                <span className="text-body-small text-on-surface-variant">{kitItemSummary(i)}</span>
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
