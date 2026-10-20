import { useMemo, useState } from "react";
import { useDeleteLibraryItem, useLibrary, useSaveLibraryItem } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Rule } from "../api/types";
import { ItemDialog, type FieldDef } from "../components/ItemDialog";
import { Chip, Empty, ErrorBox, Fab, Loading, PageHeader, useSnackbar } from "../components/ui";
import { useRel } from "../lib/relationship";
import { useConfirm } from "../lib/useConfirm";

const FIELDS: FieldDef[] = [
  { key: "title", label: "Rule", type: "text", required: true, max: 200 },
  { key: "bodyMd", label: "Details (optional)", type: "textarea", max: 5000 },
  { key: "category", label: "Category (optional)", type: "text", max: 60, help: "e.g. Speech, Protocol, Health" },
  { key: "position", label: "Number", type: "number", min: 0, help: "Filled in for you; change it to reorder." },
];

export function RulesPage() {
  const { rel, isDom } = useRel();
  const snack = useSnackbar();
  const list = useLibrary(rel.id, "rules");
  const save = useSaveLibraryItem(rel.id, "rules");
  const del = useDeleteLibraryItem(rel.id, "rules");
  const [editing, setEditing] = useState<Rule | "new" | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [confirm, confirmEl] = useConfirm();
  const current = editing && editing !== "new" ? editing : null;

  const rules = useMemo(() => [...(list.data ?? [])].sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt)), [list.data]);
  const categories = useMemo(() => [...new Set(rules.map((r) => r.category).filter((c): c is string => !!c))].sort(), [rules]);
  const shown = rules.filter((r) => !category || r.category === category);
  const nextPosition = rules.reduce((m, r) => Math.max(m, r.position), 0) + 1;

  return (
    <>
      <PageHeader title="Rules" subtitle={`${rules.length} rule${rules.length === 1 ? "" : "s"}`} />
      {categories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-4 pb-4 md:px-6">
          <Chip selected={!category} onClick={() => setCategory(null)}>
            All
          </Chip>
          {categories.map((c) => (
            <Chip key={c} selected={category === c} onClick={() => setCategory(category === c ? null : c)}>
              {c}
            </Chip>
          ))}
        </div>
      )}
      <ol className="flex flex-col gap-2 px-4 md:px-6">
        {list.isLoading && <Loading />}
        {list.error && <ErrorBox error={list.error} onRetry={() => list.refetch()} />}
        {list.data && !list.data.length && <Empty icon="gavel" title="No rules yet" body={isDom ? "Write the first one." : undefined} />}
        {shown.map((r, i) => (
          <li key={r.id}>
            <button
              type="button"
              disabled={!isDom}
              onClick={() => setEditing(r)}
              className="state-layer flex w-full items-start gap-4 rounded-md bg-surface-container-low p-4 text-left disabled:cursor-default"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-label-large text-on-primary">
                {r.position || i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-title-medium text-on-surface">{r.title}</span>
                {r.bodyMd && <span className="mt-1 block text-body-medium whitespace-pre-wrap text-on-surface-variant">{r.bodyMd}</span>}
              </span>
              {r.category && <Chip>{r.category}</Chip>}
            </button>
          </li>
        ))}
      </ol>
      {isDom && <Fab icon="add" label="New rule" onClick={() => setEditing("new")} />}
      <ItemDialog
        open={editing !== null}
        title={current ? "Edit rule" : "New rule"}
        fields={FIELDS}
        initial={
          current
            ? { title: current.title, bodyMd: current.bodyMd, category: current.category ?? "", position: current.position }
            : { title: "", bodyMd: "", category: category ?? "", position: nextPosition }
        }
        busy={save.isPending}
        onClose={() => setEditing(null)}
        onDelete={current ? () => confirm(`Delete rule “${current.title}”?`, () => del.mutate(current.id, { onSuccess: () => setEditing(null), onError: (e) => snack(errorMessage(e)) })) : undefined}
        onSubmit={(v) =>
          save.mutate(
            {
              id: current?.id,
              input: {
                title: String(v.title).trim(),
                bodyMd: String(v.bodyMd ?? ""),
                category: String(v.category ?? "").trim() || null,
                position: Math.max(0, Number(v.position) || 0),
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
