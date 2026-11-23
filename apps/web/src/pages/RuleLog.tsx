import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAddRuleLog, useDeleteRuleLog, useLibrary, useRuleLog } from "../api/hooks";
import { errorMessage } from "../api/client";
import { useOpenOnNew } from "../lib/newParam";
import { roman, sortRules } from "./Rules";
import type { RuleLogEntry } from "../api/types";
import { useTodayOccurrences } from "../lib/today";
import { SubHeader, Button, Chip, Dialog, Empty, ErrorBox, IconButton, Loading, Select, Switch, TextArea, TextField, useSnackbar } from "../components/ui";
import { fmtDate, today } from "../lib/dates";
import { useReadOnly, useRel } from "../lib/relationship";
import { useConfirm } from "../lib/useConfirm";
import { useBack } from "../lib/useBack";

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
  const log = useRuleLog(rel.id);
  const occ = useTodayOccurrences();
  const [who, setWho] = useState<string | null>(null);
  const [kind, setKind] = useState<"all" | "rules" | "protocols">("all");
  const [open, setOpen] = useState<RuleLogEntry | null>(null);
  const navigate = useNavigate();
  const back = useBack(() => navigate({ to: features.rules ? "/rules" : "/protocols" }));
  const [adding, setAdding] = useState(false);
  useOpenOnNew(() => setAdding(true), !readOnly);
  const name = (id: string) => (id === me.user.id ? "you" : memberName(id));
  const people = useMemo(() => [...new Set((log.data ?? []).map((e) => e.subjectId))], [log.data]);
  const shown = (log.data ?? []).filter(
    (e) => (!who || e.subjectId === who) && (kind === "all" || (kind === "protocols") === !!e.protocolId),
  );
  // What came of each one, from the consequence it was given.
  const byTask = new Map((occ.data ?? []).map((o) => [o.seriesId, o]));
  const outcome = (e: RuleLogEntry) => {
    if (!e.consequenceTaskId) return "none";
    const o = byTask.get(e.consequenceTaskId);
    if (!o) return "consequence given";
    const state =
      o.status === "completed"
        ? "done"
        : o.status === "submitted"
          ? null
          : o.status === "missed"
            ? "not done"
            : o.status === "excused"
              ? "excused"
              : o.status === "cancelled"
                ? "called off"
                : "owed";
    if (!state) return isDom ? "needs your approval" : "sent for approval";
    return `${o.title.toLowerCase()} · ${state}`;
  };
  const filters = features.rules && features.protocols;

  if (!features.rules && !features.protocols) return <Empty icon="gavel" title="Rules and protocols are off" body="Turn one of them on in Your dynamic to keep a log." />;

  return (
    <>
      <SubHeader
        title="Broken rules"
        back="Rules"
        onBack={back}
        actions={!readOnly && <IconButton icon="add" label={isDom ? "Log a broken rule" : "Own up to one"} onClick={() => setAdding(true)} />}
      />
      {(filters || people.length > 1) && !!log.data?.length && (
        <div className="flex gap-2 overflow-x-auto px-4 pb-2 md:px-6">
          <Chip plain className="h-10 px-5" selected={kind === "all" && !who} onClick={() => (setKind("all"), setWho(null))}>
            Everyone
          </Chip>
          {filters && (
            <>
              <Chip plain className="h-10 px-5" selected={kind === "rules"} onClick={() => setKind(kind === "rules" ? "all" : "rules")}>
                Rules
              </Chip>
              <Chip plain className="h-10 px-5" selected={kind === "protocols"} onClick={() => setKind(kind === "protocols" ? "all" : "protocols")}>
                Protocols
              </Chip>
            </>
          )}
          {people.length > 1 &&
            people.map((id) => (
              <Chip plain className="h-10 px-5" key={id} selected={who === id} onClick={() => setWho(who === id ? null : id)}>
                {id === me.user.id ? "You" : memberName(id)}
              </Chip>
            ))}
        </div>
      )}
      <ul className="flex flex-col divide-y divide-outline-variant px-4 pb-24 md:px-6">
        {log.isLoading && <Loading />}
        {log.error && <ErrorBox error={log.error} onRetry={() => log.refetch()} />}
        {log.data && !log.data.length && <Empty icon="gavel" title="Nothing logged" />}
        {log.data && !!log.data.length && !shown.length && <p className="py-6 text-body-medium text-on-surface-variant">Nothing logged here.</p>}
        {shown.map((e) => (
          <li key={e.id}>
            <button type="button" onClick={() => setOpen(e)} className="state-layer flex w-full items-start gap-3 py-4 text-left">
              <div className="min-w-0 flex-1">
                <div className="font-serif text-[26px] leading-tight text-on-surface">{e.title}</div>
                <div className="mt-1 text-body-medium text-on-surface-variant">
                  {people.length > 1 && e.loggedBy !== e.subjectId && `${e.subjectId === me.user.id ? "You" : memberName(e.subjectId)} · `}
                  {fmtDate(e.occurredOn)} · {e.loggedBy === e.subjectId ? (e.subjectId === me.user.id ? "you owned up" : `${memberName(e.subjectId)} owned up`) : `logged by ${name(e.loggedBy)}`}
                </div>
                {e.note && <div className="mt-2 font-serif text-[22px] leading-snug whitespace-pre-wrap text-on-surface-variant italic">“{e.note}”</div>}
              </div>
              <span className="shrink-0 pt-1.5 text-right text-body-small text-on-surface-variant">{outcome(e)}</span>
            </button>
          </li>
        ))}
      </ul>
      <LogDialog
        open={adding}
        onClose={() => setAdding(false)}
        defaultSubject={isDom ? ((partners.find((p) => p.role === "submissive") ?? partners[0])?.userId ?? me.user.id) : me.user.id}
      />
      {open && <EntryDialog entry={open} outcome={outcome(open)} onClose={() => setOpen(null)} />}
    </>
  );
}

/** One entry: who, when, the note, a way to the consequence, and taking it off the log. */
function EntryDialog({ entry: e, outcome, onClose }: { entry: RuleLogEntry; outcome: string; onClose(): void }) {
  const { rel, me, isDom, memberName } = useRel();
  const readOnly = useReadOnly();
  const snack = useSnackbar();
  const del = useDeleteRuleLog(rel.id);
  const navigate = useNavigate();
  const [confirm, confirmEl] = useConfirm();
  const canRemove = !readOnly && (e.loggedBy === me.user.id || isDom);
  const who = e.subjectId === me.user.id ? "You" : memberName(e.subjectId);
  return (
    <>
      <Dialog
        open
        onClose={onClose}
        title={e.title}
        actions={
          <>
            {canRemove && (
              <Button
                variant="text"
                className="mr-auto text-error"
                onClick={() =>
                  confirm(`Remove “${e.title}” from the log?`, () => del.mutate(e.id, { onSuccess: onClose, onError: (err) => snack(errorMessage(err)) }))
                }
              >
                Remove
              </Button>
            )}
            {e.consequenceTaskId && (
              <Button variant="outlined" onClick={() => void navigate({ to: "/tasks/$taskId", params: { taskId: e.consequenceTaskId! } })}>
                See the consequence
              </Button>
            )}
            {!canRemove && !e.consequenceTaskId && (
              <Button variant="text" onClick={onClose}>
                Close
              </Button>
            )}
          </>
        }
      >
        <p>
          {who} · {fmtDate(e.occurredOn)} · {e.loggedBy === e.subjectId ? "owned up" : `logged by ${e.loggedBy === me.user.id ? "you" : memberName(e.loggedBy)}`}
        </p>
        <p className="mt-1">{outcome === "none" ? "No consequence" : outcome === "needs your approval" || outcome === "sent for approval" ? `Consequence ${outcome}` : `Consequence: ${outcome}`}</p>
        {e.note && <p className="mt-3 font-serif text-[22px] leading-snug whitespace-pre-wrap text-on-surface italic">“{e.note}”</p>}
      </Dialog>
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
      title={<span className="text-[34px] leading-tight">{isDom ? "Log a broken rule" : "Own up to one"}</span>}
      actions={
        <Button className="h-14! w-full" disabled={!what || add.isPending} onClick={submit}>
          Log it
        </Button>
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
                  {roman(i + 1)}. {r.title}
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
