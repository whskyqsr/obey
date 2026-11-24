import { useState } from "react";
import { useAssignConsequence, useDeleteLibraryItem, useLibrary, useSaveLibraryItem, useTasks } from "../api/hooks";
import { OwedList, useOwed } from "../components/Owed";
import { errorMessage } from "../api/client";
import type { Consequence } from "../api/types";
import { ItemDialog, type FieldDef } from "../components/ItemDialog";
import { Button, Dialog, Empty, ErrorBox, Fab, Loading, PageHeader, Section, Select, Switch, TextArea, TextField, useSnackbar } from "../components/ui";
import { LOCK_TIME_OPTIONS, fmtMinutes } from "../components/Chastity";
import { browserTimeZone, today } from "../lib/dates";
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

const SEVERITY = ["Light", "Mild", "Moderate", "Strict", "Severe"];

export function ConsequencesPage() {
  const { rel, me, isDom, solo, memberName, features } = useRel();
  const snack = useSnackbar();
  const fields: FieldDef[] = features.chastity
    ? [
        ...FIELDS,
        {
          key: "lockMinutes",
          label: "Adds lock time",
          type: "select",
          options: LOCK_TIME_OPTIONS,
        },
      ]
    : FIELDS;
  const list = useLibrary(rel.id, "consequences");
  const save = useSaveLibraryItem(rel.id, "consequences");
  const del = useDeleteLibraryItem(rel.id, "consequences");
  const [editing, setEditing] = useState<Consequence | "new" | null>(null);
  const [assigning, setAssigning] = useState<Consequence | null>(null);
  const [confirm, confirmEl] = useConfirm();
  const current = editing && editing !== "new" ? editing : null;
  // Whose consequences show as owed: your own, or for a Dominant, the submissive's.
  const whose = isDom && !solo ? rel.members.find((m) => m.role === "submissive" && m.userId !== me.user.id)?.userId : me.user.id;
  const owed = useOwed(whose);
  // How many tasks hand each one out on a miss.
  const tasks = useTasks(rel.id);
  const usedBy = new Map<string, number>();
  for (const t of tasks.data ?? []) if (t.active && t.consequenceId) usedBy.set(t.consequenceId, (usedBy.get(t.consequenceId) ?? 0) + 1);
  const sorted = [...(list.data ?? [])].sort((a, b) => a.severity - b.severity || a.title.localeCompare(b.title));

  return (
    <>
      <PageHeader title="Consequences" />
      {(owed.owed.length > 0 || owed.excused.length > 0) && (
        <Section title={whose === me.user.id ? "You owe" : `${memberName(whose!)} owes`}>
          <OwedList {...owed} />
        </Section>
      )}
      <Section title={isDom ? "Your list" : "The list"}>
        <div className="flex flex-col divide-y divide-outline-variant">
          {list.isLoading && <Loading />}
          {list.error && <ErrorBox error={list.error} onRetry={() => list.refetch()} />}
          {list.data && !list.data.length && <Empty icon="bolt" title="No consequences yet" />}
          {sorted.map((c) => {
            const used = usedBy.get(c.id) ?? 0;
            const notes = [
              SEVERITY[c.severity - 1],
              c.bodyMd.trim() || null,
              features.chastity && c.lockMinutes ? `adds ${fmtMinutes(c.lockMinutes)} to the lock` : null,
              used ? `used by ${used} task${used === 1 ? "" : "s"}` : null,
            ].filter(Boolean);
            return (
              <div key={c.id} className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!isDom}
                  onClick={() => setEditing(c)}
                  className="state-layer state-row flex min-w-0 flex-1 flex-col py-3 text-left disabled:cursor-default"
                >
                  <span className="text-body-large text-on-surface">{c.title}</span>
                  {notes.length > 0 && <span className="line-clamp-2 text-body-medium whitespace-pre-wrap text-on-surface-variant">{notes.join(" · ")}</span>}
                </button>
                {isDom && (
                  <Button variant="text" className="-mr-3" onClick={() => setAssigning(c)}>
                    Assign
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </Section>
      {isDom && <Fab icon="add" label="New consequence" onClick={() => setEditing("new")} />}
      <ItemDialog
        open={editing !== null}
        title={current ? "Edit consequence" : "New consequence"}
        fields={fields}
        initial={
          current
            ? {
                title: current.title,
                bodyMd: current.bodyMd,
                severity: String(current.severity),
                lockMinutes: current.lockMinutes ? String(current.lockMinutes) : "",
              }
            : { title: "", bodyMd: "", severity: "1", lockMinutes: "" }
        }
        busy={save.isPending}
        onClose={() => setEditing(null)}
        onDelete={
          current
            ? () =>
                confirm(`Delete “${current.title}”?`, () =>
                  del.mutate(current.id, { onSuccess: () => setEditing(null), onError: (e) => snack(errorMessage(e)) }),
                )
            : undefined
        }
        onSubmit={(v) =>
          save.mutate(
            {
              id: current?.id,
              input: {
                title: String(v.title).trim(),
                bodyMd: String(v.bodyMd ?? ""),
                severity: Number(v.severity) || 1,
                lockMinutes: features.chastity ? Number(v.lockMinutes) || null : (current?.lockMinutes ?? null),
              },
            },
            { onSuccess: () => setEditing(null), onError: (e) => snack(errorMessage(e)) },
          )
        }
      />
      {assigning && <AssignDialog consequence={assigning} onClose={() => setAssigning(null)} />}
      {confirmEl}
    </>
  );
}

/** Hands out a consequence on its own; it shows up on their Today like a one-off task. */
function AssignDialog({ consequence, onClose }: { consequence: Consequence; onClose(): void }) {
  const { rel, me, features } = useRel();
  const snack = useSnackbar();
  const assign = useAssignConsequence(rel.id);
  const subs = rel.members.filter((m) => m.userId !== me.user.id);
  const [form, setForm] = useState({
    assigneeId: (subs.find((m) => m.role === "submissive") ?? subs[0] ?? rel.members[0])!.userId,
    date: today(),
    allDay: true,
    dueTime: "21:00",
    reason: "",
    approvalRequired: false,
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const lockTime = features.chastity ? consequence.lockMinutes : null;
  const submit = () =>
    assign.mutate(
      {
        id: consequence.id,
        input: {
          assigneeId: form.assigneeId,
          date: form.date,
          dueTime: form.allDay ? null : form.dueTime,
          timezone: browserTimeZone(),
          reason: form.reason,
          approvalRequired: form.approvalRequired,
        },
      },
      {
        onSuccess: () => {
          snack(lockTime ? `Added ${fmtMinutes(lockTime)} to their lock` : "Consequence assigned");
          onClose();
        },
        onError: (e) => snack(errorMessage(e)),
      },
    );
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Assign “${consequence.title}”`}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={assign.isPending} disabled={!form.date} onClick={submit}>
            Assign
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {rel.members.length > 2 && (
          <Select label="Assigned to" value={form.assigneeId} onChange={(e) => set({ assigneeId: e.target.value })}>
            {rel.members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.displayName}
              </option>
            ))}
          </Select>
        )}
        <TextArea label="Reason (optional)" value={form.reason} onChange={(e) => set({ reason: e.target.value })} maxLength={2000} rows={2} />
        {lockTime ? (
          <p className="text-body-medium text-on-surface-variant">
            This adds {fmtMinutes(lockTime)} to their lock straight away. It needs a running lock with an end time.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-start gap-4">
              <TextField label="Due" type="date" value={form.date} min={today()} onChange={(e) => set({ date: e.target.value })} className="w-44" />
              {!form.allDay && <TextField label="At" type="time" value={form.dueTime} onChange={(e) => set({ dueTime: e.target.value })} className="w-36" />}
            </div>
            <Switch checked={form.allDay} onChange={(allDay) => set({ allDay })} label="Any time that day" />
            <Switch
              checked={form.approvalRequired}
              onChange={(approvalRequired) => set({ approvalRequired })}
              label="Needs approval"
              help="It counts as served only after you approve it."
            />
          </>
        )}
      </div>
    </Dialog>
  );
}
