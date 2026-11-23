import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useDeleteLibraryItem, useLibrary, useReorder, useSaveLibraryItem } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Rule } from "../api/types";
import { ItemDialog, type FieldDef } from "../components/ItemDialog";
import { SortableList } from "../components/SortableList";
import { Chip, Empty, ErrorBox, Fab, IconButton, Loading, PageHeader, SegmentedButtons, useSnackbar } from "../components/ui";
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
  const { rel, isDom, features } = useRel();
  const navigate = useNavigate();
  const snack = useSnackbar();
  const list = useLibrary(rel.id, "rules");
  const save = useSaveLibraryItem(rel.id, "rules");
  const del = useDeleteLibraryItem(rel.id, "rules");
  const reorder = useReorder(rel.id, "rules");
  const protocolsQ = useLibrary(rel.id, "protocols", features.protocols);
  const [editing, setEditing] = useState<Rule | "new" | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [confirm, confirmEl] = useConfirm();
  const current = editing && editing !== "new" ? editing : null;

  const rules = useMemo(() => sortRules(list.data ?? []), [list.data]);
  const number = useMemo(() => new Map(rules.map((r, i) => [r.id, i + 1])), [rules]);
  const categories = useMemo(() => [...new Set(rules.map((r) => r.category).filter((c): c is string => !!c))].sort(), [rules]);
  const shown = rules.filter((r) => !category || r.category === category);
  // Protocols that spell out each rule, in their own list order.
  const protocolsByRule = useMemo(() => {
    const m = new Map<string, { id: string; title: string }[]>();
    for (const p of sortRules(protocolsQ.data ?? [])) if (p.ruleId) m.set(p.ruleId, [...(m.get(p.ruleId) ?? []), p]);
    return m;
  }, [protocolsQ.data]);

  return (
    <>
      <PageHeader
        title="Rules"
        subtitle={`${rules.length} rule${rules.length === 1 ? "" : "s"}`}
        tools={<IconButton icon="assignment_late" label="Broken rules" onClick={() => void navigate({ to: "/rule-log" })} />}
      />
      <RulesTabs current="rules" />
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
      <ol className="flex flex-col border-t border-outline-variant mx-4 md:mx-6">
        {list.isLoading && <Loading />}
        {list.error && <ErrorBox error={list.error} onRetry={() => list.refetch()} />}
        {list.data && !list.data.length && <Empty icon="gavel" title="No rules yet" body={isDom ? "Write the first one." : undefined} />}
        {/* Reordering works on the whole list, so it's off while a category filter is on. */}
        <SortableList items={shown} enabled={isDom && !category} onReorder={(next) => reorder.mutate(next, { onError: (e) => snack(errorMessage(e)) })}>
          {(r, _i, handle) => (
            <div className="border-b border-outline-variant py-2">
              <div className="flex items-start gap-1">
                {handle}
                <button
                  type="button"
                  disabled={!isDom}
                  onClick={() => setEditing(r)}
                  className="state-layer flex min-w-0 flex-1 items-start gap-4 rounded-sm py-2 pr-2 text-left disabled:cursor-default"
                >
                  {/* Numbered like clauses in a letter: i, ii, iii. */}
                  <span className="w-8 shrink-0 font-serif text-[24px] leading-8 text-primary">{roman(number.get(r.id) ?? 0)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-serif text-[24px] leading-8 text-on-surface">{r.title}</span>
                    {r.bodyMd && <span className="mt-1 block text-body-medium whitespace-pre-wrap text-on-surface-variant">{r.bodyMd}</span>}
                  </span>
                  {/* The filter already says which category; the chip only helps in the full list. */}
                  {r.category && !category && <Chip>{r.category}</Chip>}
                </button>
              </div>
              {features.protocols && !!protocolsByRule.get(r.id)?.length && (
                <div className="flex flex-wrap gap-x-3 pb-2 pl-12 text-body-medium text-on-surface-variant">
                  {protocolsByRule.get(r.id)!.map((p) => (
                    <Link
                      key={p.id}
                      to="/protocols/$protocolId"
                      params={{ protocolId: p.id }}
                      className="hover:underline"
                    >
                      See protocol: <span className="text-primary">{p.title}</span>
                    </Link>
                  ))}
                </div>
              )}
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
        onDelete={
          current
            ? () => confirm(`Delete rule “${current.title}”?`, () => del.mutate(current.id, { onSuccess: () => setEditing(null), onError: (e) => snack(errorMessage(e)) }))
            : undefined
        }
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

/** Rules and protocols are one place: a toggle under the title, shown when both are switched on. */
export function RulesTabs({ current }: { current: "rules" | "protocols" }) {
  const { features } = useRel();
  const navigate = useNavigate();
  if (!features.rules || !features.protocols) return null;
  return (
    <div className="px-4 pb-4 md:px-6">
      <SegmentedButtons
        value={current}
        onChange={(v) => void navigate({ to: v === "rules" ? "/rules" : "/protocols" })}
        options={[
          { value: "rules", label: "Rules" },
          { value: "protocols", label: "Protocols" },
        ]}
      />
    </div>
  );
}

/** 1 → i, 4 → iv, 12 → xii. */
export function roman(n: number): string {
  const table: [number, string][] = [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
  let out = "";
  for (const [v, sym] of table) while (n >= v) (out += sym), (n -= v);
  return out;
}
