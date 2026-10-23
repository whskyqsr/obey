import { useState } from "react";
import { Link } from "@tanstack/react-router";
import type { AgreementDrift, AgreementSection, AgreementSectionInput, AgreementVersion } from "../api/types";
import { useAgree, useAgreement, useAgreementTemplate, useAgreementVersion, useProposeAgreement, useRequestAgreementChanges, useWithdrawAgreement } from "../api/hooks";
import { errorMessage } from "../api/client";
import { Badge, Button, Checkbox, Dialog, ErrorBox, Icon, IconButton, Loading, OverflowMenu, PageHeader, TextArea, TextField, cx, useSnackbar } from "../components/ui";
import { fmtDate, localDateOf } from "../lib/dates";
import { useReadOnly, useRel } from "../lib/relationship";

const ICONS: Record<string, string> = { why: "favorite", limits: "block", safewords: "health_and_safety", rules: "gavel", protocols: "fact_check" };
const sectionIcon = (s: { id: string; kind: string }) => ICONS[s.kind === "text" ? s.id : s.kind] ?? (/^(dom|sub)-/.test(s.id) ? "person" : "article");
const day = (iso: string) => fmtDate(localDateOf(new Date(iso)), { month: "short", day: "numeric", year: "numeric" });
const toInput = (s: AgreementSection): AgreementSectionInput => ({ id: s.id, kind: s.kind, title: s.title, body: s.body, noteId: s.noteId });
const isOpen = (v: AgreementVersion) => v.status === "proposed" || v.status === "changes_requested";

type View = { kind: "page" } | { kind: "review" } | { kind: "versions" } | { kind: "version"; id: string };

/** The agreement: the version in force, the open proposal, and the editor for proposing changes. */
export function AgreementPage() {
  const { rel, me } = useRel();
  const q = useAgreement(rel.id);
  const readOnly = useReadOnly();
  const [view, setView] = useState<View | null>(null);
  const [editing, setEditing] = useState<"edit" | "template" | "blank" | null>(null);
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const { current, proposal, drift } = q.data;
  const waitingOnMe = !!proposal && proposal.status === "proposed" && !proposal.agreements.some((a) => a.userId === me.user.id);
  // Someone with a proposal to answer lands on it.
  const v = view ?? (waitingOnMe ? { kind: "review" } : { kind: "page" });

  if (editing) return <Editor base={editing === "edit" ? (proposal ?? current) : null} start={editing} proposal={proposal} current={current} onClose={() => setEditing(null)} />;
  if (v.kind === "review" && proposal) return <Review v={proposal} current={current} onBack={() => setView({ kind: "page" })} onEdit={() => setEditing("edit")} />;
  if (v.kind === "versions") return <Versions onBack={() => setView({ kind: "page" })} onOpen={(id) => setView({ kind: "version", id })} />;
  if (v.kind === "version") return <PastVersion id={v.id} onBack={() => setView({ kind: "versions" })} />;

  return (
    <>
      <PageHeader title="Agreement" subtitle={current ? `Version ${current.number} · agreed ${day(current.agreedAt!)}` : proposal ? "Nothing agreed yet" : "Not written yet"} />
      <div className="flex flex-col gap-4 px-4 pb-8 md:px-6">
        {proposal && <ProposalBanner v={proposal} onRead={() => setView({ kind: "review" })} onEdit={() => setEditing("edit")} />}
        {current && !proposal && drift.length > 0 && <DriftBanner drift={drift} onPropose={readOnly ? undefined : () => setEditing("edit")} />}
        {current ? (
          <>
            <Body v={current} />
            <Signatures v={current} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button variant="text" icon="history" onClick={() => setView({ kind: "versions" })}>
                Versions
              </Button>
              {!readOnly && !proposal && (
                <Button variant="tonal" icon="edit" onClick={() => setEditing("edit")}>
                  Propose changes
                </Button>
              )}
            </div>
          </>
        ) : (
          !proposal && (
            <div className="flex flex-col items-start gap-3 rounded-xl bg-surface-container-low p-5">
              <Icon name="handshake" size={32} className="text-primary" />
              <h2 className="text-headline-small">Write down what you've agreed</h2>
              <p className="text-body-medium text-on-surface-variant">
                One page you both sign: why you're doing this, what each of you will do, limits, safewords, and your rules and protocols. Either of you can propose changes later,
                and a new version only counts once you both agree.
              </p>
              {!readOnly && (
                <>
                  <Button onClick={() => setEditing("template")}>Start from our template</Button>
                  <Button variant="text" onClick={() => setEditing("blank")}>
                    Start blank
                  </Button>
                </>
              )}
            </div>
          )
        )}
      </div>
    </>
  );
}

/** Rules or protocols changed after the version in force was written, so what's signed no longer matches them. */
function DriftBanner({ drift, onPropose }: { drift: AgreementDrift[]; onPropose?(): void }) {
  const { rel } = useRel();
  const what = [...new Set(drift.map((d) => (d.kind === "rules" ? "Rules" : "Protocols")))].join(" and ");
  const line = (verb: AgreementDrift["verb"]) => drift.filter((d) => d.verb === verb).map((d) => d.title);
  const added = line("added"),
    removed = line("removed");
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-secondary-container px-4 py-3 text-on-secondary-container">
      <div className="flex items-center gap-2 text-title-medium">
        <Icon name="published_with_changes" />
        {what} changed since you {rel.members.length > 2 ? "all" : "both"} signed
      </div>
      {added.length > 0 && <div className="text-body-medium opacity-85">Added: {added.join(", ")}</div>}
      {removed.length > 0 && <div className="text-body-medium opacity-85">Removed: {removed.join(", ")}</div>}
      {onPropose && (
        <div className="mt-2">
          <Button icon="edit" onClick={onPropose}>
            Propose an update
          </Button>
        </div>
      )}
    </div>
  );
}

/** What's happening with the open proposal, from where the viewer stands. */
function ProposalBanner({ v, onRead, onEdit }: { v: AgreementVersion; onRead(): void; onEdit(): void }) {
  const { rel, me, memberName, partners } = useRel();
  const snack = useSnackbar();
  const withdraw = useWithdrawAgreement(rel.id);
  const readOnly = useReadOnly();
  const mine = v.proposedBy === me.user.id;
  const waiting = partners.filter((p) => !v.agreements.some((a) => a.userId === p.userId)).map((p) => p.displayName);
  const by = memberName(v.proposedBy);
  const tone = "flex flex-col gap-1 rounded-xl bg-tertiary-container px-4 py-3 text-on-tertiary-container";
  if (v.status === "changes_requested" && v.feedback)
    return (
      <div className={tone}>
        <div className="text-title-medium">
          {v.feedback.userId === me.user.id ? `You asked ${by} for changes to version ${v.number}` : `${memberName(v.feedback.userId)} asked for changes to version ${v.number}`}
        </div>
        <div className="text-body-medium italic opacity-85">“{v.feedback.note}”</div>
        {!readOnly && (
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="tonal" onClick={onRead}>
              Read it
            </Button>
            <Button variant="text" icon="edit" onClick={onEdit}>
              Edit
            </Button>
          </div>
        )}
      </div>
    );
  return (
    <div className={tone}>
      <div className="text-title-medium">{mine ? `You proposed version ${v.number}` : `${by} proposed version ${v.number}`}</div>
      <div className="text-body-medium opacity-85">{waiting.length ? `Waiting for ${waiting.join(" and ")}` : `Waiting for you`}</div>
      {v.note && <div className="text-body-medium italic opacity-85">“{v.note}”</div>}
      {!readOnly && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="tonal" onClick={onRead}>
            Read it
          </Button>
          {mine && (
            <>
              <Button variant="text" icon="edit" onClick={onEdit}>
                Edit
              </Button>
              <Button
                variant="text"
                busy={withdraw.isPending}
                onClick={() => withdraw.mutate(v.id, { onSuccess: () => snack("Proposal withdrawn"), onError: (e) => snack(errorMessage(e)) })}
              >
                Withdraw
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** A section's text: "- " lines become bullets, with added and removed lines marked when [marked]. */
function Lines({ s, marked }: { s: AgreementSection; marked: boolean }) {
  const lines = marked ? s.lines : s.lines.filter((l) => l.op !== "del");
  const bullets = s.kind !== "text";
  const groups: { list: boolean; lines: typeof lines }[] = [];
  for (const l of lines) {
    const list = bullets || l.text.startsWith("- ");
    const last = groups.at(-1);
    if (last && last.list === list) last.lines.push(l);
    else groups.push({ list, lines: [l] });
  }
  const text = (l: (typeof lines)[number]) => {
    const t = bullets ? l.text : l.text.replace(/^- /, "");
    if (!marked || l.op === "same") return t;
    return l.op === "add" ? (
      <span className="rounded-xs bg-[color-mix(in_srgb,#2e7d32_16%,transparent)] px-0.5">{t}</span>
    ) : (
      <span className="text-error line-through opacity-80">{t}</span>
    );
  };
  return (
    <>
      {groups.map((g, i) =>
        g.list ? (
          <ul key={i} className="flex list-disc flex-col gap-1 pl-5">
            {g.lines.map((l, j) => (
              <li key={j}>{text(l)}</li>
            ))}
          </ul>
        ) : (
          g.lines.map((l, j) => <p key={`${i}-${j}`}>{text(l)}</p>)
        ),
      )}
    </>
  );
}

function SectionView({ s, marked }: { s: AgreementSection; marked: boolean }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="flex items-center gap-2 text-title-medium">
        <Icon name={sectionIcon(s)} size={20} className="text-primary" />
        {s.title}
        {marked && s.change === "new" && <Badge tone="tertiary">New</Badge>}
      </h3>
      <Lines s={s} marked={marked} />
      {s.noteId && s.noteTitle && (
        <Link to="/notes/$noteId" params={{ noteId: s.noteId }} className="flex items-center gap-1 self-start text-label-large text-primary">
          <Icon name="sticky_note_2" size={18} /> {s.noteTitle}
        </Link>
      )}
      {s.kind !== "text" && (
        <div className="text-body-small text-on-surface-variant">
          {s.items.length ? `From ${s.kind === "rules" ? "Rules" : "Protocols"}, as of this version` : `No ${s.kind} yet`}
        </div>
      )}
    </section>
  );
}

/** The whole page of a version, optionally with what changed marked. */
function Body({ v, marked = false, only }: { v: AgreementVersion; marked?: boolean; only?: Set<string> }) {
  const sections = only ? v.sections.filter((s) => only.has(s.id)) : v.sections;
  return (
    <div className="flex flex-col gap-5 rounded-xl bg-surface-container-low p-4 text-body-large md:p-5">
      {sections.map((s) => (
        <SectionView key={s.id} s={s} marked={marked} />
      ))}
      {marked &&
        v.removed.map((t) => (
          <section key={t} className="flex items-center gap-2 text-title-medium text-error line-through opacity-80">
            <Icon name="article" size={20} />
            {t}
          </section>
        ))}
      {v.reviewBy && !only && (
        <section className="flex flex-col gap-1.5">
          <h3 className="flex items-center gap-2 text-title-medium">
            <Icon name="event_repeat" size={20} className="text-primary" />
            Review
          </h3>
          <p>We'll read this again together by {fmtDate(v.reviewBy, { month: "short", day: "numeric", year: "numeric" })}.</p>
        </section>
      )}
    </div>
  );
}

/** One tile per person: their name in a signature hand once they've agreed. */
function Signatures({ v }: { v: AgreementVersion }) {
  const { rel } = useRel();
  return (
    <div className="grid grid-cols-2 gap-3">
      {rel.members.map((m) => {
        const a = v.agreements.find((x) => x.userId === m.userId);
        return (
          <div key={m.userId} className="flex flex-col gap-0.5 rounded-lg bg-surface-container px-3 py-3">
            <span className="text-body-small text-on-surface-variant">Agreed by</span>
            {a ? (
              <span className="font-serif text-title-large italic">{m.displayName}</span>
            ) : (
              <span className="text-body-medium text-on-surface-variant">Waiting for {m.displayName}</span>
            )}
            <span className="text-body-small text-on-surface-variant">{a ? day(a.agreedAt) : " "}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Reading a proposal: what changed first, then agree or ask for changes. */
function Review({ v, current, onBack, onEdit }: { v: AgreementVersion; current: AgreementVersion | null; onBack(): void; onEdit(): void }) {
  const { me, memberName } = useRel();
  const readOnly = useReadOnly();
  const [all, setAll] = useState(!current);
  const [agreeing, setAgreeing] = useState(false);
  const [asking, setAsking] = useState(false);
  const changed = new Set(v.sections.filter((s) => s.change !== "same").map((s) => s.id));
  const unchanged = v.sections.length - changed.size;
  const mine = v.proposedBy === me.user.id;
  const agreed = v.agreements.some((a) => a.userId === me.user.id);
  const by = memberName(v.proposedBy);
  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-1">
            <IconButton icon="arrow_back" label="Back" onClick={onBack} />
            Agreement
          </span>
        }
        subtitle={`Version ${v.number}, proposed by ${by === "You" ? "you" : by} ${day(v.proposedAt)}`}
      />
      <div className="flex flex-col gap-4 px-4 pb-8 md:px-6">
        {current && (
          <div className="flex flex-col gap-1 rounded-xl bg-tertiary-container px-4 py-3 text-on-tertiary-container">
            <div className="text-title-medium">
              {v.changes} change{v.changes === 1 ? "" : "s"} from version {current.number}
            </div>
            {v.note && (
              <div className="text-body-medium italic opacity-85">
                {by}: “{v.note}”
              </div>
            )}
          </div>
        )}
        {v.feedback && (
          <div className="rounded-xl bg-surface-container-high px-4 py-3 text-body-medium">
            {memberName(v.feedback.userId)} asked for changes: <span className="italic">“{v.feedback.note}”</span>
          </div>
        )}
        <Body v={v} marked={!!current} only={all ? undefined : changed} />
        {!all && unchanged > 0 && (
          <Button variant="text" icon="unfold_more" className="self-start" onClick={() => setAll(true)}>
            {unchanged} section{unchanged === 1 ? "" : "s"} unchanged · Show all
          </Button>
        )}
        <Signatures v={v} />
        {!readOnly && (
          <div className="flex flex-wrap justify-end gap-2">
            {mine ? (
              <Button variant="tonal" icon="edit" onClick={onEdit}>
                Edit
              </Button>
            ) : (
              <>
                {v.status === "proposed" && (
                  <Button variant="outlined" onClick={() => setAsking(true)}>
                    Ask for changes
                  </Button>
                )}
                {!agreed && (
                  <Button icon="handshake" onClick={() => setAgreeing(true)}>
                    Agree
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </div>
      {agreeing && <AgreeDialog v={v} current={current} onClose={() => setAgreeing(false)} onDone={onBack} />}
      {asking && <AskChangesDialog v={v} current={current} onClose={() => setAsking(false)} onDone={onBack} />}
    </>
  );
}

function AgreeDialog({ v, current, onClose, onDone }: { v: AgreementVersion; current: AgreementVersion | null; onClose(): void; onDone(): void }) {
  const { rel, me } = useRel();
  const snack = useSnackbar();
  const agree = useAgree(rel.id);
  const last = rel.members.every((m) => m.userId === me.user.id || v.agreements.some((a) => a.userId === m.userId));
  const [read, setRead] = useState(false);
  return (
    <Dialog
      open
      onClose={onClose}
      icon="handshake"
      title={`Agree to version ${v.number}?`}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button
            busy={agree.isPending}
            disabled={!read}
            onClick={() =>
              agree.mutate(v.id, {
                onSuccess: (r) => {
                  onClose();
                  onDone();
                  snack(r.status === "agreed" ? `Version ${v.number} is in force` : "Agreed");
                },
                onError: (e) => snack(errorMessage(e)),
              })
            }
          >
            Agree
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p>
          {last ? "It takes effect now for both of you" : "It takes effect once everyone has agreed"}
          {current ? `, and replaces version ${current.number}` : ""}. Either of you can propose changes at any time.
        </p>
        <Checkbox checked={read} onChange={setRead} label={`I've read all of version ${v.number}, including the parts that didn't change.`} />
      </div>
    </Dialog>
  );
}

function AskChangesDialog({ v, current, onClose, onDone }: { v: AgreementVersion; current: AgreementVersion | null; onClose(): void; onDone(): void }) {
  const { rel, memberName } = useRel();
  const snack = useSnackbar();
  const ask = useRequestAgreementChanges(rel.id);
  const [note, setNote] = useState("");
  const by = memberName(v.proposedBy);
  return (
    <Dialog
      open
      onClose={onClose}
      icon="rate_review"
      title="Ask for changes"
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button
            busy={ask.isPending}
            disabled={!note.trim()}
            onClick={() =>
              ask.mutate(
                { id: v.id, note: note.trim() },
                {
                  onSuccess: () => {
                    onClose();
                    onDone();
                    snack(`Sent to ${by}`);
                  },
                  onError: (e) => snack(errorMessage(e)),
                },
              )
            }
          >
            Send
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p>
          {by} is told and can edit the proposal.{current ? ` Version ${current.number} stays in force meanwhile.` : ""}
        </p>
        <TextArea label={`Note to ${by}`} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Dialog>
  );
}

function Versions({ onBack, onOpen }: { onBack(): void; onOpen(id: string): void }) {
  const { rel, memberName, partners } = useRel();
  const q = useAgreement(rel.id);
  const by = (id: string | null) => memberName(id).replace(/^You$/, "you");
  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-1">
            <IconButton icon="arrow_back" label="Back" onClick={onBack} />
            Versions
          </span>
        }
        subtitle="Agreement"
      />
      <div className="flex flex-col gap-3 px-4 pb-8 md:px-6">
        <div className="flex flex-col overflow-hidden rounded-xl bg-surface-container-low">
          {q.data?.versions.map((v, i) => (
            <button
              key={v.id}
              onClick={() => onOpen(v.id)}
              className={cx("state-layer flex items-center gap-4 px-4 py-3 text-left", i > 0 && "border-t border-surface-container-highest")}
            >
              <Icon
                name={v.status === "agreed" ? "verified" : v.status === "superseded" ? "history" : "pending"}
                filled={v.status === "agreed"}
                className={v.status === "agreed" ? "text-primary" : v.status === "superseded" ? "text-on-surface-variant" : "text-tertiary"}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-title-medium">
                  Version {v.number}
                  {v.status === "agreed" && <Badge>In force</Badge>}
                  {(v.status === "proposed" || v.status === "changes_requested") && (
                    <Badge tone="tertiary">{v.status === "changes_requested" ? "Changes asked for" : `Waiting for ${partners.map((p) => p.displayName).join(" and ")}`}</Badge>
                  )}
                </div>
                <div className="text-body-medium text-on-surface-variant">
                  {v.agreedAt
                    ? `Agreed by ${rel.members.length > 2 ? "everyone" : "both"} ${day(v.agreedAt)} · proposed by ${by(v.proposedBy)}`
                    : `Proposed by ${by(v.proposedBy)} ${day(v.proposedAt)}`}
                  {v.number > 1 && ` · ${v.changes} change${v.changes === 1 ? "" : "s"}`}
                </div>
              </div>
              <Icon name="chevron_right" />
            </button>
          ))}
        </div>
        <p className="text-body-small text-on-surface-variant">Old versions stay readable, with what changed in each.</p>
      </div>
    </>
  );
}

function PastVersion({ id, onBack }: { id: string; onBack(): void }) {
  const q = useAgreementVersion(id);
  const v = q.data;
  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-1">
            <IconButton icon="arrow_back" label="Back" onClick={onBack} />
            {v ? `Version ${v.number}` : "Version"}
          </span>
        }
        subtitle={v ? (v.agreedAt ? `Agreed ${day(v.agreedAt)}` : `Proposed ${day(v.proposedAt)}`) : undefined}
      />
      <div className="flex flex-col gap-4 px-4 pb-8 md:px-6">
        {q.isLoading && <Loading />}
        {q.error && <ErrorBox error={q.error} onRetry={() => q.refetch()} />}
        {v && (
          <>
            {v.number > 1 && v.changes > 0 && (
              <p className="text-body-medium text-on-surface-variant">
                {v.changes} change{v.changes === 1 ? "" : "s"} from the version before, marked below.
              </p>
            )}
            <Body v={v} marked={v.number > 1} />
            <Signatures v={v} />
          </>
        )}
      </div>
    </>
  );
}

let nextId = 0;
const freshId = () => `s-${Date.now().toString(36)}-${nextId++}`;

/** Proposing a version: every section editable, Rules and Protocols pulled in as they stand. */
function Editor({
  base,
  start,
  proposal,
  current,
  onClose,
}: {
  base: AgreementVersion | null;
  start: "edit" | "template" | "blank";
  proposal: AgreementVersion | null;
  current: AgreementVersion | null;
  onClose(): void;
}) {
  const { rel, partners, features } = useRel();
  const snack = useSnackbar();
  const propose = useProposeAgreement(rel.id);
  const template = useAgreementTemplate(rel.id, start === "template");
  const [sections, setSections] = useState<AgreementSectionInput[] | null>(
    base ? base.sections.map(toInput) : start === "blank" ? [{ id: "why", kind: "text", title: "Why we're doing this", body: "", noteId: null }] : null,
  );
  const [reviewBy, setReviewBy] = useState(base?.reviewBy ?? "");
  const [note, setNote] = useState(proposal && base === proposal ? proposal.note : "");
  const list = sections ?? template.data?.sections ?? null;
  const names = partners.map((p) => p.displayName).join(" and ") || "your partner";
  const number = proposal?.number ?? (current ? current.number + 1 : 1);
  const set = (next: AgreementSectionInput[]) => setSections(next);
  const update = (i: number, patch: Partial<AgreementSectionInput>) => list && set(list.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, by: number) => {
    if (!list) return;
    const next = [...list];
    const [s] = next.splice(i, 1);
    next.splice(i + by, 0, s!);
    set(next);
  };
  const has = (kind: string) => list?.some((s) => s.kind === kind);
  const valid = !!list?.length && list.every((s) => s.title.trim());
  const send = () =>
    list &&
    propose.mutate(
      { sections: list.map((s) => ({ ...s, title: s.title.trim() })), reviewBy: reviewBy || null, note: note.trim() },
      {
        onSuccess: (v) => {
          onClose();
          snack(v.status === "agreed" ? `Version ${v.number} is in force` : `Sent to ${names}`);
        },
        onError: (e) => snack(errorMessage(e)),
      },
    );
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col">
      <div className="flex h-16 items-center gap-2 px-2 md:px-4">
        <IconButton icon="close" label="Close" onClick={onClose} />
        <h1 className="flex-1 text-title-large">Version {number}</h1>
        <Button busy={propose.isPending} disabled={!valid} onClick={send}>
          Send to {names}
        </Button>
      </div>
      <div className="flex flex-col gap-3 px-4 pb-10 md:px-6">
        <p className="text-body-medium text-on-surface-variant">
          Changes take effect once you {rel.members.length > 2 ? "all" : "both"} agree.{current ? ` Until then version ${current.number} stays in force.` : ""}
        </p>
        {!list && <Loading />}
        {list?.map((s, i) => (
          <div key={s.id} className="flex flex-col gap-3 rounded-lg border border-outline-variant bg-surface p-3">
            <div className="flex items-center gap-2">
              <Icon name={sectionIcon(s)} size={20} className="text-primary" />
              <input
                aria-label="Section title"
                value={s.title}
                maxLength={80}
                onChange={(e) => update(i, { title: e.target.value })}
                className="min-w-0 flex-1 bg-transparent text-title-medium outline-none"
              />
              <OverflowMenu
                items={[
                  ...(i > 0 ? [{ label: "Move up", icon: "arrow_upward", onClick: () => move(i, -1) }] : []),
                  ...(i < list.length - 1 ? [{ label: "Move down", icon: "arrow_downward", onClick: () => move(i, 1) }] : []),
                  ...(s.noteId ? [{ label: "Unlink the note", icon: "link_off", onClick: () => update(i, { noteId: null }) }] : []),
                  ...(list.length > 1 ? [{ label: "Remove", icon: "delete", danger: true, onClick: () => set(list.filter((_, j) => j !== i)) }] : []),
                ]}
              />
            </div>
            {s.kind === "text" ? (
              <TextArea
                aria-label={s.title}
                rows={Math.min(10, Math.max(3, s.body.split("\n").length + 2))}
                value={s.body}
                maxLength={5000}
                placeholder="Start a line with - for a bullet"
                onChange={(e) => update(i, { body: e.target.value })}
              />
            ) : (
              <p className="text-body-medium text-on-surface-variant">
                The current list from {s.kind === "rules" ? "Rules" : "Protocols"}. Edit them in{" "}
                <Link to={s.kind === "rules" ? "/rules" : "/protocols"} className="text-primary">
                  {s.kind === "rules" ? "Rules" : "Protocols"}
                </Link>
                .
              </p>
            )}
            {s.noteId && <div className="text-body-small text-on-surface-variant">Links to a note</div>}
          </div>
        ))}
        {list && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outlined" icon="add" onClick={() => set([...list, { id: freshId(), kind: "text", title: "New section", body: "", noteId: null }])}>
              Add a section
            </Button>
            {features.rules && !has("rules") && (
              <Button variant="text" icon="gavel" onClick={() => set([...list, { id: "rules", kind: "rules", title: "Rules", body: "", noteId: null }])}>
                Add the rules
              </Button>
            )}
            {features.protocols && !has("protocols") && (
              <Button variant="text" icon="fact_check" onClick={() => set([...list, { id: "protocols", kind: "protocols", title: "Protocols", body: "", noteId: null }])}>
                Add the protocols
              </Button>
            )}
          </div>
        )}
        <TextField label="Review by (optional)" type="date" value={reviewBy} onChange={(e) => setReviewBy(e.target.value)} className="w-52" />
        <TextArea label={`What changed, for ${names}`} value={note} maxLength={500} rows={2} onChange={(e) => setNote(e.target.value)} />
      </div>
    </div>
  );
}
