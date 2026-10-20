import { useMemo, useState } from "react";
import { useDeleteLibraryItem, useLibrary, useReorder, useSaveLibraryItem } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Protocol } from "../api/types";
import { ItemDialog, type FieldDef } from "../components/ItemDialog";
import { SortableList } from "../components/SortableList";
import { Empty, ErrorBox, Fab, Icon, IconButton, Loading, PageHeader, useSnackbar } from "../components/ui";
import { useRel } from "../lib/relationship";
import { useConfirm } from "../lib/useConfirm";
import { sortRules } from "./Rules";

export function ProtocolsPage() {
  const { rel, isDom, features } = useRel();
  const snack = useSnackbar();
  const list = useLibrary(rel.id, "protocols");
  const rulesQ = useLibrary(rel.id, "rules");
  const save = useSaveLibraryItem(rel.id, "protocols");
  const del = useDeleteLibraryItem(rel.id, "protocols");
  const reorder = useReorder(rel.id, "protocols");
  const [editing, setEditing] = useState<Protocol | "new" | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [confirm, confirmEl] = useConfirm();
  const current = editing && editing !== "new" ? editing : null;

  const protocols = useMemo(() => sortRules(list.data ?? []), [list.data]);
  const rules = useMemo(() => (features.rules ? sortRules(rulesQ.data ?? []) : []), [rulesQ.data, features.rules]);
  const ruleLabel = (id: string | null) => {
    const i = rules.findIndex((r) => r.id === id);
    return i < 0 ? null : `Rule ${i + 1}: ${rules[i]!.title}`;
  };
  const toggle = (id: string) => setOpen((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set([...s, id])));

  const fields: FieldDef[] = [
    { key: "title", label: "Protocol", type: "text", required: true, max: 200, help: "e.g. Hydration, Greeting, Bedtime" },
    { key: "bodyMd", label: "What's expected, and when and how", type: "textarea", max: 20000 },
    ...(rules.length
      ? [{ key: "ruleId", label: "Spells out a rule (optional)", type: "select" as const, options: [{ value: "", label: "No rule" }, ...rules.map((r, i) => ({ value: r.id, label: `${i + 1}. ${r.title}` }))] }]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Protocols"
        subtitle={`${protocols.length} protocol${protocols.length === 1 ? "" : "s"}${isDom && protocols.length > 1 ? " · drag to reorder" : ""}`}
      />
      <ol className="flex flex-col gap-2 px-4 md:px-6">
        {list.isLoading && <Loading />}
        {list.error && <ErrorBox error={list.error} onRetry={() => list.refetch()} />}
        {list.data && !list.data.length && (
          <Empty icon="fact_check" title="No protocols yet" body={isDom ? "Spell out exactly what's expected, and when and how it's done." : undefined} />
        )}
        <SortableList items={protocols} enabled={isDom} onReorder={(next) => reorder.mutate(next, { onError: (e) => snack(errorMessage(e)) })}>
          {(p, _i, handle) => {
            const expanded = open.has(p.id);
            const rule = ruleLabel(p.ruleId);
            return (
              <div className="flex items-start gap-1 rounded-md bg-surface-container-low py-2 pr-2 pl-1">
                {handle ?? <span className="w-3" />}
                <button type="button" onClick={() => toggle(p.id)} aria-expanded={expanded} className="state-layer flex min-w-0 flex-1 flex-col gap-1 rounded-sm p-2 text-left">
                  <span className="flex items-center gap-2 text-title-medium text-on-surface">
                    {p.title}
                    {p.bodyMd && <Icon name={expanded ? "expand_less" : "expand_more"} size={20} className="text-on-surface-variant" />}
                  </span>
                  {rule && (
                    <span className="flex items-center gap-1 text-label-medium text-primary">
                      <Icon name="gavel" size={16} /> {rule}
                    </span>
                  )}
                  {p.bodyMd && (
                    <span className={expanded ? "block text-body-medium whitespace-pre-wrap text-on-surface-variant" : "line-clamp-2 text-body-medium text-on-surface-variant"}>{p.bodyMd}</span>
                  )}
                </button>
                {isDom && <IconButton icon="edit" label={`Edit ${p.title}`} onClick={() => setEditing(p)} />}
              </div>
            );
          }}
        </SortableList>
      </ol>
      {isDom && <Fab icon="add" label="New protocol" onClick={() => setEditing("new")} />}
      <ItemDialog
        open={editing !== null}
        title={current ? "Edit protocol" : "New protocol"}
        fields={fields}
        initial={current ? { title: current.title, bodyMd: current.bodyMd, ruleId: current.ruleId ?? "" } : { title: "", bodyMd: "", ruleId: "" }}
        busy={save.isPending}
        onClose={() => setEditing(null)}
        onDelete={
          current
            ? () => confirm(`Delete protocol “${current.title}”?`, () => del.mutate(current.id, { onSuccess: () => setEditing(null), onError: (e) => snack(errorMessage(e)) }))
            : undefined
        }
        onSubmit={(v) =>
          save.mutate(
            {
              id: current?.id,
              input: {
                title: String(v.title).trim(),
                bodyMd: String(v.bodyMd ?? ""),
                // Keep an existing link when the rules list is hidden (Rules switched off).
                ...(rules.length ? { ruleId: String(v.ruleId ?? "") || null } : {}),
              },
            },
            { onSuccess: () => setEditing(null), onError: (e) => snack(errorMessage(e)) },
          )
        }
      />
      {confirmEl}
    </>
  );
}
