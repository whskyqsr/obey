import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useDeleteLibraryItem, useLibrary, useSaveLibraryItem } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Protocol } from "../api/types";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { Button, ErrorBox, Icon, IconButton, Loading, Select, useSnackbar } from "../components/ui";
import { useRel } from "../lib/relationship";
import { useConfirm } from "../lib/useConfirm";
import { sortRules } from "./Rules";

/** One protocol, full page: formatted for reading, with the notes editor for a Dominant. */
export function ProtocolPage({ protocolId }: { protocolId: string }) {
  const { rel } = useRel();
  const list = useLibrary(rel.id, "protocols");
  const isNew = protocolId === "new";
  const protocol = list.data?.find((p) => p.id === protocolId);
  if (!isNew && list.isLoading) return <Loading />;
  if (!isNew && list.error) return <ErrorBox error={list.error} onRetry={() => list.refetch()} />;
  if (!isNew && !protocol) return <ErrorBox error="That protocol doesn't exist any more." />;
  return <ProtocolView key={protocolId} protocol={protocol} />;
}

function ProtocolView({ protocol }: { protocol?: Protocol }) {
  const { rel, isDom, features } = useRel();
  const navigate = useNavigate();
  const snack = useSnackbar();
  const rulesQ = useLibrary(rel.id, "rules");
  const save = useSaveLibraryItem(rel.id, "protocols");
  const del = useDeleteLibraryItem(rel.id, "protocols");
  const [confirm, confirmEl] = useConfirm();
  const rules = features.rules ? sortRules(rulesQ.data ?? []) : [];

  const [editing, setEditing] = useState(!protocol);
  const [form, setForm] = useState({ title: protocol?.title ?? "", bodyMd: protocol?.bodyMd ?? "", ruleId: protocol?.ruleId ?? null });
  const [dirty, setDirty] = useState(false);
  const set = (patch: Partial<typeof form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setDirty(true);
  };
  const back = () => navigate({ to: "/protocols" });
  const ruleIndex = rules.findIndex((r) => r.id === form.ruleId);

  function submit() {
    save.mutate(
      // With Rules switched off the picker is hidden, so leave the link as it was.
      { id: protocol?.id, input: { title: form.title.trim(), bodyMd: form.bodyMd, ...(rules.length || !protocol ? { ruleId: form.ruleId } : {}) } },
      {
        onSuccess: (saved) => {
          setDirty(false);
          setEditing(false);
          snack("Saved");
          if (!protocol && saved?.id) navigate({ to: "/protocols/$protocolId", params: { protocolId: saved.id }, replace: true });
        },
        onError: (e) => snack(errorMessage(e)),
      },
    );
  }

  function discard() {
    setForm({ title: protocol!.title, bodyMd: protocol!.bodyMd, ruleId: protocol!.ruleId });
    setDirty(false);
    setEditing(false);
  }

  const deleteButton = protocol && isDom && (
    <IconButton
      icon="delete"
      label="Delete"
      onClick={() =>
        confirm(`Delete protocol “${protocol.title}”?`, () =>
          del.mutate(protocol.id, {
            onSuccess: () => {
              snack("Protocol deleted");
              back();
            },
            onError: (e) => snack(errorMessage(e)),
          }),
        )
      }
    />
  );

  if (protocol && !editing) {
    return (
      <div className="flex flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-1 bg-surface px-2 md:px-4">
          <IconButton icon="arrow_back" label="Back" onClick={back} />
          <div className="flex-1" />
          {deleteButton}
          {isDom && (
            <Button onClick={() => setEditing(true)} icon="edit">
              Edit
            </Button>
          )}
        </header>
        <article className="flex flex-col gap-3 px-4 pb-10 md:px-6">
          <h1 className="text-headline-medium text-on-surface">{form.title}</h1>
          {ruleIndex >= 0 && (
            <span className="flex items-center gap-1 text-label-large text-primary">
              <Icon name="gavel" size={18} /> Rule {ruleIndex + 1}: {rules[ruleIndex]!.title}
            </span>
          )}
          {form.bodyMd ? (
            <MarkdownEditor value={form.bodyMd} onChange={() => {}} editable={false} bare />
          ) : (
            <p className="text-body-medium text-on-surface-variant">No details yet.</p>
          )}
        </article>
        {confirmEl}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* h-14 matches the formatting toolbar's sticky offset (top-14) in MarkdownEditor. */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-1 bg-surface px-2 md:px-4">
        <IconButton
          icon={protocol ? "close" : "arrow_back"}
          label={protocol ? "Stop editing" : "Back"}
          onClick={() => {
            const leave = protocol ? discard : back;
            if (dirty) confirm("Discard unsaved changes?", leave);
            else leave();
          }}
        />
        <div className="flex-1" />
        {deleteButton}
        <Button onClick={submit} busy={save.isPending} disabled={!form.title.trim() || (!dirty && !!protocol)} icon="save">
          Save
        </Button>
      </header>
      <div className="flex flex-col gap-4 px-4 pb-10 md:px-6">
        <input
          value={form.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="Protocol name, e.g. Hydration"
          maxLength={200}
          className="w-full bg-transparent text-headline-medium text-on-surface outline-none placeholder:text-on-surface-variant/60"
        />
        {rules.length > 0 && (
          <Select label="Spells out a rule (optional)" value={form.ruleId ?? ""} onChange={(e) => set({ ruleId: e.target.value || null })} className="max-w-md">
            <option value="">No rule</option>
            {rules.map((r, i) => (
              <option key={r.id} value={r.id}>
                {i + 1}. {r.title}
              </option>
            ))}
          </Select>
        )}
        <MarkdownEditor value={form.bodyMd} onChange={(bodyMd) => set({ bodyMd })} placeholder="What's expected, and when and how it's done." />
      </div>
      {confirmEl}
    </div>
  );
}
