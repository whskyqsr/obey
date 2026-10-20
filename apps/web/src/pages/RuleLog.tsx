import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useAddRuleLog, useDeleteRuleLog, useLibrary, useRuleLog } from "../api/hooks";
import { errorMessage } from "../api/client";
import { sortRules } from "./Rules";
import { Avatar } from "../components/Avatar";
import { Button, Chip, Dialog, Empty, ErrorBox, Fab, Icon, IconButton, Loading, PageHeader, Select, Switch, TextArea, TextField, useSnackbar } from "../components/ui";
import { fmtDate, today } from "../lib/dates";
import { useReadOnly, useRel } from "../lib/relationship";
import { useConfirm } from "../lib/useConfirm";

const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const addDays = (d: string, n: number) => {
  const t = new Date(`${d}T12:00:00`);
  t.setDate(t.getDate() + n);
  return t.toISOString().slice(0, 10);
};

/**
 * Broken rules and protocols. A Dominant logs them for anyone and can give a consequence in the same step; anyone can
 * own up to their own. It's a record, not a scoreboard: entries show what, who, when and what came of it.
 */
export function RuleLogPage() {
  const { rel, me, isDom, partners, features, memberName } = useRel();
  const readOnly = useReadOnly();
  const snack = useSnackbar();
  const log = useRuleLog(rel.id);
  const del = useDeleteRuleLog(rel.id);
  const [who, setWho] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirm, confirmEl] = useConfirm();
  const name = (id: string) => (id === me.user.id ? "You" : memberName(id));
  const people = useMemo(() => [...new Set((log.data ?? []).map((e) => e.subjectId))], [log.data]);
  const shown = (log.data ?? []).filter((e) => !who || e.subjectId === who);

  if (!features.rules && !features.protocols) return <Empty icon="gavel" title="Rules and protocols are off" body="Turn one of them on in Your dynamic to keep a log." />;

  return (
    <>
      <PageHeader title="Broken rules" subtitle={log.data ? `${log.data.length} logged` : undefined} />
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
      <ul className="flex flex-col gap-2 px-4 pb-24 md:px-6">
        {log.isLoading && <Loading />}
        {log.error && <ErrorBox error={log.error} onRetry={() => log.refetch()} />}
        {log.data && !log.data.length && (
          <Empty
            icon="gavel"
            title="Nothing logged"
            body={isDom ? "When a rule or protocol is broken, log it here, with a consequence if you like." : "If you break a rule or protocol, you can own up to it here."}
          />
        )}
        {shown.map((e) => {
          const m = rel.members.find((x) => x.userId === e.subjectId);
          const canRemove = !readOnly && (e.loggedBy === me.user.id || isDom);
          return (
            <li key={e.id} className="flex items-start gap-3 rounded-md bg-surface-container-low p-3">
              <Avatar userId={e.subjectId} name={m?.displayName ?? "?"} version={m?.avatarVersion ?? null} size={32} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-title-medium text-on-surface">
                  <Icon name={e.protocolId || (!e.ruleId && !e.title) ? "fact_check" : "gavel"} size={18} className="text-on-surface-variant" />
                  <span className="min-w-0 truncate">{e.title}</span>
                </div>
                <div className="text-label-medium text-on-surface-variant">
                  {name(e.subjectId)} · {fmtDate(e.occurredOn)} · {e.loggedBy === e.subjectId ? "owned up" : `logged by ${name(e.loggedBy)}`}
                </div>
                {e.note && <div className="mt-1 text-body-medium whitespace-pre-wrap text-on-surface-variant">{e.note}</div>}
                {e.consequenceTaskId && (
                  <Link
                    to="/tasks/$taskId"
                    params={{ taskId: e.consequenceTaskId }}
                    className="state-layer mt-2 inline-flex h-8 items-center gap-1.5 rounded-sm border border-outline-variant px-3 text-label-large text-on-surface-variant"
                  >
                    <Icon name="bolt" size={18} /> Consequence given
                  </Link>
                )}
              </div>
              {canRemove && (
                <IconButton
                  icon="delete"
                  label="Remove from log"
                  onClick={() => confirm(`Remove “${e.title}” from the log?`, () => del.mutate(e.id, { onError: (err) => snack(errorMessage(err)) }))}
                />
              )}
            </li>
          );
        })}
      </ul>
      {!readOnly && <Fab icon="add" label={isDom ? "Log a broken rule" : "Own up to one"} onClick={() => setAdding(true)} />}
      <LogDialog open={adding} onClose={() => setAdding(false)} defaultSubject={isDom ? (partners.find((p) => p.role === "submissive") ?? partners[0])?.userId : me.user.id} />
      {confirmEl}
    </>
  );
}

function LogDialog({ open, onClose, defaultSubject }: { open: boolean; onClose(): void; defaultSubject?: string }) {
  const { rel, me, isDom, features } = useRel();
  const snack = useSnackbar();
  const rules = useLibrary(rel.id, "rules", features.rules && open);
  const protocols = useLibrary(rel.id, "protocols", features.protocols && open);
  const consequences = useLibrary(rel.id, "consequences", isDom && features.consequences && open);
  const add = useAddRuleLog(rel.id);
  const [subject, setSubject] = useState(defaultSubject ?? me.user.id);
  const [what, setWhat] = useState("");
  const [on, setOn] = useState(today());
  const [note, setNote] = useState("");
  const [consequenceId, setConsequenceId] = useState("");
  const [due, setDue] = useState(addDays(today(), 1));
  const [dueTime, setDueTime] = useState("20:00");
  const [approval, setApproval] = useState(false);

  const close = () => {
    setWhat("");
    setNote("");
    setConsequenceId("");
    onClose();
  };
  const submit = () => {
    const [kind, id] = what.split(":");
    add.mutate(
      {
        subjectId: subject,
        ruleId: kind === "r" ? id! : null,
        protocolId: kind === "p" ? id! : null,
        note: note.trim(),
        occurredOn: on,
        ...(consequenceId && { consequence: { consequenceId, date: due, dueTime: dueTime || null, timezone: zone(), approvalRequired: approval } }),
      },
      { onSuccess: () => (snack(consequenceId ? "Logged, and the consequence is on their list" : "Logged"), close()), onError: (e) => snack(errorMessage(e)) },
    );
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={isDom ? "Log a broken rule" : "Own up to a broken rule"}
      actions={
        <>
          <Button variant="text" onClick={close}>
            Cancel
          </Button>
          <Button disabled={!what || add.isPending} onClick={submit}>
            Log it
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {isDom && (
          <Select label="Who" value={subject} onChange={(e) => setSubject(e.target.value)}>
            {rel.members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.userId === me.user.id ? "Me" : m.displayName}
              </option>
            ))}
          </Select>
        )}
        <Select label="What was broken" value={what} onChange={(e) => setWhat(e.target.value)}>
          <option value="" disabled>
            Pick a rule or protocol
          </option>
          {!!rules.data?.length && (
            <optgroup label="Rules">
              {sortRules(rules.data).map((r, i) => (
                <option key={r.id} value={`r:${r.id}`}>
                  {i + 1}. {r.title}
                </option>
              ))}
            </optgroup>
          )}
          {!!protocols.data?.length && (
            <optgroup label="Protocols">
              {sortRules(protocols.data).map((p) => (
                <option key={p.id} value={`p:${p.id}`}>
                  {p.title}
                </option>
              ))}
            </optgroup>
          )}
        </Select>
        <TextField label="When" type="date" value={on} max={today()} onChange={(e) => setOn(e.target.value)} className="w-48" />
        <TextArea label="Note (optional)" value={note} maxLength={2000} rows={2} onChange={(e) => setNote(e.target.value)} />
        {isDom && features.consequences && subject !== me.user.id && (
          <>
            <Select label="Consequence (optional)" value={consequenceId} onChange={(e) => setConsequenceId(e.target.value)}>
              <option value="">None</option>
              {(consequences.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </Select>
            {consequenceId && (
              <>
                <div className="flex flex-wrap gap-3">
                  <TextField label="Due" type="date" value={due} min={today()} onChange={(e) => setDue(e.target.value)} className="w-48" />
                  <TextField label="By" type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} className="w-36" />
                </div>
                <Switch checked={approval} onChange={setApproval} label="Needs your approval" />
              </>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
