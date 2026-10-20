import { useMemo, useState } from "react";
import { useDeleteLibraryItem, useLibrary, useReorder, useSaveLibraryItem } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Rule } from "../api/types";
import { ItemDialog, type FieldDef } from "../components/ItemDialog";
import { SortableList } from "../components/SortableList";
import { Chip, Empty, ErrorBox, Fab, Loading, PageHeader, useSnackbar } from "../components/ui";
import { useRel } from "../lib/relationship";
import { useConfirm } from "../lib/useConfirm";

const FIELDS: FieldDef[] = [
  { key: "title", label: "Rule", type: "text", required: true, max: 200 },
  { key: "bodyMd", label: "Details (optional)", type: "textarea", max: 5000 },
  { key: "category", label: "Category (optional)", type: "text", max: 60, help: "e.g. Speech, Conduct, Health" },
];

/** Rules in reading order; numbers come from this order, so they're always 1, 2, 3… */
export const sortRules = <T extends { position: number; createdAt: string }>(rules: T[]) =>
  [...rules].sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));

export function RulesPage() {
  const { rel, isDom } = useRel();
  const snack = useSnackbar();
  const list = useLibrary(rel.id, "rules");
  const save = useSaveLibraryItem(rel.id, "rules");
  const del = useDeleteLibraryItem(rel.id, "rules");
  const reorder = useReorder(rel.id, "rules");
  const [editing, setEditing] = useState<Rule | "new" | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [confirm, confirmEl] = useConfirm();
  const current = editing && editing !== "new" ? editing : null;

  const rules = useMemo(() => sortRules(list.data ?? []), [list.data]);
  const number = useMemo(() => new Map(rules.map((r, i) => [r.id, i + 1])), [rules]);
  const categories = useMemo(() => [...new Set(rules.map((r) => r.category).filter((c): c is string => !!c))].sort(), [rules]);
  const shown = rules.filter((r) => !category || r.category === category);

  return (
    <>
      <PageHeader
        title="Rules"
        subtitle={`${rules.length} rule${rules.length === 1 ? "" : "s"}`}
      />
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
        {/* Reordering works on the whole list, so it's off while a category filter is on. */}
        <SortableList items={shown} enabled={isDom && !category} onReorder={(next) => reorder.mutate(next, { onError: (e) => snack(errorMessage(e)) })}>
          {(r, _i, handle) => (
            <div className="flex items-start gap-1 rounded-md bg-surface-container-low py-2 pr-2 pl-1">
              {handle ?? <span className="w-3" />}
              <button
                type="button"
                disabled={!isDom}
                onClick={() => setEditing(r)}
                className="state-layer flex min-w-0 flex-1 items-start gap-4 rounded-sm p-2 text-left disabled:cursor-default"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-label-large text-on-primary">{number.get(r.id)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-title-medium text-on-surface">{r.title}</span>
                  {r.bodyMd && <span className="mt-1 block text-body-medium whitespace-pre-wrap text-on-surface-variant">{r.bodyMd}</span>}
                </span>
                {r.category && <Chip>{r.category}</Chip>}
              </button>
            </div>
          )}
        </SortableList>
      </ol>
      {isDom && <Fab icon="add" label="New rule" onClick={() => setEditing("new")} />}
      <ItemDialog
        open={editing !== null}
        title={current ? "Edit rule" : "New rule"}
        fields={FIELDS}
        initial={current ? { title: current.title, bodyMd: current.bodyMd, category: current.category ?? "" } : { title: "", bodyMd: "", category: category ?? "" }}
        busy={save.isPending}
        onClose={() => setEditing(null)}
        onDelete={current ? () => confirm(`Delete rule “${current.title}”?`, () => del.mutate(current.id, { onSuccess: () => setEditing(null), onError: (e) => snack(errorMessage(e)) })) : undefined}
        onSubmit={(v) =>
          save.mutate(
            {
              id: current?.id,
              input: { title: String(v.title).trim(), bodyMd: String(v.bodyMd ?? ""), category: String(v.category ?? "").trim() || null },
            },
            { onSuccess: () => setEditing(null), onError: (e) => snack(errorMessage(e)) },
          )
        }
      />
      {confirmEl}
    </>
  );
}
