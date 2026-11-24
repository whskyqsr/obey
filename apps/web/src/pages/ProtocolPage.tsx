import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useDeleteLibraryItem, useLibrary, useRuleLog, useSaveLibraryItem, useTasks } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Protocol } from "../api/types";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { BackLink, Button, ErrorBox, IconButton, Loading, OverflowMenu, Select, useSnackbar } from "../components/ui";
import { fmtDate, today } from "../lib/dates";
import { useRel } from "../lib/relationship";
import { useBack } from "../lib/useBack";
import { useConfirm } from "../lib/useConfirm";
import { roman, sortRules } from "./Rules";

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
  // Back to where it was opened from, e.g. a rule's protocol link returns to Rules.
  const back = useBack(() => navigate({ to: "/protocols" }));
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

  const remove = () =>
    protocol &&
    confirm(`Delete protocol “${protocol.title}”?`, () =>
      del.mutate(protocol.id, {
        onSuccess: () => {
          snack("Protocol deleted");
          // Deleting returns to the list, never back through history.
          void navigate({ to: "/protocols", replace: true });
        },
        onError: (e) => snack(errorMessage(e)),
      }),
    );

  if (protocol && !editing) {
    return (
      <div className="flex flex-col">
        <header className="sticky top-0 z-20 flex h-14 max-w-3xl items-center gap-1 bg-surface px-4 md:px-6 lg:px-16">
          <div className="flex-1">
            <BackLink label="Protocols" onClick={() => void navigate({ to: "/protocols" })} />
          </div>
          {isDom && <IconButton icon="edit" label="Edit" onClick={() => setEditing(true)} />}
          {isDom && <OverflowMenu items={[{ label: "Delete", icon: "delete", danger: true, onClick: remove }]} />}
        </header>
        <article className="flex max-w-3xl flex-col px-4 pb-10 md:px-6 lg:px-16">
          <h1 className="mt-2 font-serif text-[46px] leading-[1.05] text-on-surface md:text-[56px]">{form.title}</h1>
          {ruleIndex >= 0 && (
            <p className="mt-2 text-body-medium text-on-surface-variant">
              Spells out rule {roman(ruleIndex + 1)}: {rules[ruleIndex]!.title}.
            </p>
          )}
          <div className="mt-4">
            {form.bodyMd ? (
              <MarkdownEditor value={form.bodyMd} onChange={() => {}} editable={false} letters />
            ) : (
              <p className="text-body-medium text-on-surface-variant">Nothing written yet.</p>
            )}
          </div>
          <Broken protocolId={protocol.id} />
        </article>
        {confirmEl}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* h-14 matches the formatting toolbar's sticky offset (top-14) in MarkdownEditor. */}
      <header className="sticky top-0 z-20 flex h-14 max-w-3xl items-center gap-1 bg-surface px-4 md:px-6 lg:px-16">
        <button
          type="button"
          className="state-layer -ml-2 h-10 rounded-md px-2 text-body-large text-on-surface-variant"
          onClick={() => {
            const leave = protocol ? discard : back;
            if (dirty) confirm("Discard unsaved changes?", leave);
            else leave();
          }}
        >
          Cancel
        </button>
        <div className="flex-1" />
        <Button onClick={submit} busy={save.isPending} disabled={!form.title.trim() || (!dirty && !!protocol)}>
          Save
        </Button>
      </header>
      <div className="flex max-w-3xl flex-col gap-4 px-4 pb-10 md:px-6 lg:px-16">
        <input
          value={form.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="Name it"
          maxLength={200}
          className="w-full bg-transparent font-serif text-[40px] leading-tight text-on-surface outline-none placeholder:text-on-surface-variant/60"
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
        <MarkdownEditor value={form.bodyMd} onChange={(bodyMd) => set({ bodyMd })} placeholder="What's expected, and when and how it's done." letters />
      </div>
      {confirmEl}
    </div>
  );
}

/** "Broken this month": this protocol's rule log entries since the 1st, with the consequence each one got. */
function Broken({ protocolId }: { protocolId: string }) {
  const { rel, features } = useRel();
  const log = useRuleLog(rel.id);
  const tasks = useTasks(rel.id);
  const month = today().slice(0, 7);
  const entries = (log.data ?? []).filter((e) => e.protocolId === protocolId && e.occurredOn.startsWith(month));
  if (!features.rules || !entries.length) return null;
  return (
    <section className="mt-8">
      <h2 className="eyebrow mb-1">Broken this month</h2>
      {entries.map((e) => (
        <div key={e.id} className="flex items-center gap-4 border-b border-outline-variant py-3 last:border-b-0">
          <div className="min-w-0 flex-1">
            <div className="text-body-large text-on-surface">{fmtDate(e.occurredOn, { weekday: "short", month: "short", day: "numeric" })}</div>
            {e.note && <div className="text-body-medium text-on-surface-variant">{e.note}</div>}
          </div>
          {e.consequenceTaskId && (
            <span className="shrink-0 text-body-medium text-on-surface-variant">
              {tasks.data?.find((t) => t.id === e.consequenceTaskId)?.title.toLowerCase() ?? "consequence"}
            </span>
          )}
        </div>
      ))}
    </section>
  );
}
