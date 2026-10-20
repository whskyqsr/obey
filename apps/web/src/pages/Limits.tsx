import { useMemo, useState } from "react";
import { useDeleteLimit, useLimits, useSaveLimit } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Limit, LimitKind } from "../api/types";
import { Avatar } from "../components/Avatar";
import { ItemDialog, type FieldDef } from "../components/ItemDialog";
import { Chip, Empty, ErrorBox, Fab, Icon, Loading, PageHeader, cx, useSnackbar } from "../components/ui";
import { useReadOnly, useRel } from "../lib/relationship";
import { useConfirm } from "../lib/useConfirm";

const KINDS: { kind: LimitKind; title: string; icon: string; help: string; tone: string }[] = [
  { kind: "hard", title: "Hard limits", icon: "block", help: "Never, under any circumstances.", tone: "text-error" },
  { kind: "soft", title: "Soft limits", icon: "pan_tool", help: "Only with care, or ask first.", tone: "text-tertiary" },
  { kind: "curious", title: "Curious about", icon: "explore", help: "Open to trying, carefully.", tone: "text-primary" },
];

const FIELDS: FieldDef[] = [
  { key: "title", label: "Limit", type: "text", required: true, max: 200 },
  {
    key: "kind",
    label: "Kind",
    type: "select",
    options: KINDS.map((k) => ({ value: k.kind, label: { hard: "Hard limit", soft: "Soft limit", curious: "Curious about" }[k.kind] })),
  },
  { key: "note", label: "Note (optional)", type: "textarea", max: 2000, help: "Anything that helps, like where the line is." },
];

/**
 * Everyone's hard and soft limits and what they're curious about. Partners see each other's; only the person whose
 * limit it is can change it, and partners get a notification when they do.
 */
export function LimitsPage() {
  const { rel, me, memberName } = useRel();
  const readOnly = useReadOnly();
  const snack = useSnackbar();
  const list = useLimits(rel.id);
  const save = useSaveLimit(rel.id);
  const del = useDeleteLimit(rel.id);
  const [who, setWho] = useState<string | null>(null);
  const [editing, setEditing] = useState<Limit | LimitKind | null>(null);
  const [confirm, confirmEl] = useConfirm();
  const current = editing && typeof editing === "object" ? editing : null;
  const people = useMemo(() => [me.user.id, ...rel.members.map((m) => m.userId).filter((id) => id !== me.user.id)], [rel.members, me.user.id]);
  const shown = (list.data ?? []).filter((l) => !who || l.ownerId === who);
  const name = (id: string) => (id === me.user.id ? "You" : memberName(id));

  return (
    <>
      <PageHeader title="Limits" subtitle="Everyone's, in one place. Only you can change yours." />
      {people.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-4 pb-4 md:px-6">
          <Chip selected={!who} onClick={() => setWho(null)}>
            Everyone
          </Chip>
          {people.map((id) => (
            <Chip key={id} selected={who === id} onClick={() => setWho(who === id ? null : id)}>
              {name(id)}
            </Chip>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-6 px-4 pb-24 md:px-6">
        {list.isLoading && <Loading />}
        {list.error && <ErrorBox error={list.error} onRetry={() => list.refetch()} />}
        {list.data && !list.data.length && (
          <Empty icon="shield" title="No limits written down yet" body="Add your hard limits, soft limits and anything you're curious about, so your partner always knows." />
        )}
        {list.data &&
          !!list.data.length &&
          KINDS.map((k) => {
            const items = shown.filter((l) => l.kind === k.kind);
            return (
              <section key={k.kind}>
                <div className="flex items-center gap-2 pb-2">
                  <Icon name={k.icon} className={k.tone} />
                  <h2 className="text-title-medium text-on-surface">{k.title}</h2>
                  <span className="text-body-medium text-on-surface-variant">· {k.help}</span>
                </div>
                {!items.length && <div className="rounded-md bg-surface-container-low px-4 py-3 text-body-medium text-on-surface-variant">None yet.</div>}
                <ul className="flex flex-col gap-2">
                  {items.map((l) => {
                    const mine = l.ownerId === me.user.id;
                    const m = rel.members.find((x) => x.userId === l.ownerId);
                    return (
                      <li key={l.id}>
                        <button
                          type="button"
                          disabled={!mine || readOnly}
                          onClick={() => setEditing(l)}
                          className={cx(
                            "state-layer flex w-full items-start gap-3 rounded-md bg-surface-container-low p-3 text-left disabled:cursor-default",
                            "border-l-4",
                            k.kind === "hard" ? "border-error" : "border-transparent",
                          )}
                        >
                          <Avatar userId={l.ownerId} name={m?.displayName ?? "?"} version={m?.avatarVersion ?? null} size={32} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-title-medium text-on-surface">{l.title}</span>
                            <span className="block text-label-medium text-on-surface-variant">{name(l.ownerId)}</span>
                            {l.note && <span className="mt-1 block text-body-medium whitespace-pre-wrap text-on-surface-variant">{l.note}</span>}
                          </span>
                          {mine && !readOnly && <Icon name="edit" size={20} className="text-on-surface-variant" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
      </div>
      {!readOnly && <Fab icon="add" label="Add a limit" onClick={() => setEditing("hard")} />}
      <ItemDialog
        open={editing !== null}
        title={current ? "Edit your limit" : "Add a limit"}
        fields={FIELDS}
        initial={current ? { title: current.title, kind: current.kind, note: current.note } : { title: "", kind: typeof editing === "string" ? editing : "hard", note: "" }}
        busy={save.isPending}
        onClose={() => setEditing(null)}
        onDelete={
          current
            ? () =>
                confirm(`Remove “${current.title}” from your limits?`, () => del.mutate(current.id, { onSuccess: () => setEditing(null), onError: (e) => snack(errorMessage(e)) }))
            : undefined
        }
        onSubmit={(v) =>
          save.mutate(
            { id: current?.id, input: { title: String(v.title).trim(), kind: v.kind as LimitKind, note: String(v.note ?? "").trim() } },
            { onSuccess: () => setEditing(null), onError: (e) => snack(errorMessage(e)) },
          )
        }
      />
      {confirmEl}
    </>
  );
}
