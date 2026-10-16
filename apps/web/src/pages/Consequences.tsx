import { useState } from "react";
import { useDeleteLibraryItem, useLibrary, useSaveLibraryItem } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Consequence } from "../api/types";
import { ItemDialog, type FieldDef } from "../components/ItemDialog";
import { Empty, ErrorBox, Fab, Icon, Loading, PageHeader, useSnackbar } from "../components/ui";
import { useRel } from "../lib/relationship";
import { useConfirm } from "../lib/useConfirm";

const FIELDS: FieldDef[] = [
  { key: "title", label: "Consequence", type: "text", required: true, max: 200 },
  { key: "bodyMd", label: "Details", type: "textarea", max: 5000 },
  {
    key: "severity",
    label: "Severity",
    type: "select",
    options: [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} – ${["Light", "Mild", "Moderate", "Strict", "Severe"][n - 1]}` })),
  },
];

export function ConsequencesPage() {
  const { rel, isDom } = useRel();
  const snack = useSnackbar();
  const list = useLibrary(rel.id, "consequences");
  const save = useSaveLibraryItem(rel.id, "consequences");
  const del = useDeleteLibraryItem(rel.id, "consequences");
  const [editing, setEditing] = useState<Consequence | "new" | null>(null);
  const [confirm, confirmEl] = useConfirm();
  const current = editing && editing !== "new" ? editing : null;
  const sorted = [...(list.data ?? [])].sort((a, b) => a.severity - b.severity || a.title.localeCompare(b.title));

  return (
    <>
      <PageHeader title="Consequences" subtitle="Applied when a task is missed or a rule is broken. Edit them here without touching tasks." />
      <div className="flex flex-col gap-2 px-4 md:px-6">
        {list.isLoading && <Loading />}
        {list.error && <ErrorBox error={list.error} onRetry={() => list.refetch()} />}
        {list.data && !list.data.length && <Empty icon="bolt" title="No consequences yet" />}
        {sorted.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={!isDom}
            onClick={() => setEditing(c)}
            className="state-layer flex items-start gap-4 rounded-md bg-surface-container-low p-4 text-left disabled:cursor-default"
          >
            <div className="flex shrink-0 gap-0.5 pt-1 text-error" aria-label={`Severity ${c.severity}`}>
              {Array.from({ length: 5 }, (_, i) => (
                <Icon key={i} name="bolt" size={16} filled={i < c.severity} className={i < c.severity ? "" : "opacity-25"} />
              ))}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-title-medium text-on-surface">{c.title}</div>
              {c.bodyMd && <div className="mt-1 text-body-medium whitespace-pre-wrap text-on-surface-variant">{c.bodyMd}</div>}
            </div>
          </button>
        ))}
      </div>
      {isDom && <Fab icon="add" label="New consequence" onClick={() => setEditing("new")} />}
      <ItemDialog
        open={editing !== null}
        title={current ? "Edit consequence" : "New consequence"}
        fields={FIELDS}
        initial={current ? { title: current.title, bodyMd: current.bodyMd, severity: String(current.severity) } : { title: "", bodyMd: "", severity: "1" }}
        busy={save.isPending}
        onClose={() => setEditing(null)}
        onDelete={current ? () => confirm(`Delete “${current.title}”?`, () => del.mutate(current.id, { onSuccess: () => setEditing(null), onError: (e) => snack(errorMessage(e)) })) : undefined}
        onSubmit={(v) =>
          save.mutate(
            { id: current?.id, input: { title: String(v.title).trim(), bodyMd: String(v.bodyMd ?? ""), severity: Number(v.severity) || 1 } },
            { onSuccess: () => setEditing(null), onError: (e) => snack(errorMessage(e)) },
          )
        }
      />
      {confirmEl}
    </>
  );
}
