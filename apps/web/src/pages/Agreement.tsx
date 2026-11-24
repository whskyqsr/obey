import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { AgreementDrift, AgreementSection, AgreementSectionInput, AgreementVersion } from "../api/types";
import {
  useAgree,
  useAgreement,
  useLibrary,
  useAgreementTemplate,
  useAgreementVersion,
  useProposeAgreement,
  useRequestAgreementChanges,
  useWithdrawAgreement,
} from "../api/hooks";
import { errorMessage } from "../api/client";
import {
  BackLink,
  Button,
  Checkbox,
  Dialog,
  ErrorBox,
  Icon,
  IconButton,
  Loading,
  OverflowMenu,
  PageHeader,
  TextArea,
  TextField,
  useSnackbar,
} from "../components/ui";
import { fmtDate, localDateOf, today } from "../lib/dates";
import { useReadOnly, useRel } from "../lib/relationship";

/** "Oct 12", with the year only when it isn't this one. */
const day = (iso: string) => {
  const d = localDateOf(new Date(iso));
  return fmtDate(d, d.slice(0, 4) === today().slice(0, 4) ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
};
const toInput = (s: AgreementSection): AgreementSectionInput => ({ id: s.id, kind: s.kind, title: s.title, body: s.body, noteId: s.noteId });

type View = { kind: "page" } | { kind: "review" } | { kind: "versions" } | { kind: "version"; id: string };

/** Mockup 23: the version in force, and an open proposal with what changed. */
export function AgreementPage() {
  const { rel } = useRel();
  const q = useAgreement(rel.id);
  const readOnly = useReadOnly();
  const [view, setView] = useState<View>({ kind: "page" });
  const [editing, setEditing] = useState<"edit" | "template" | "blank" | null>(null);
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const { current, proposal, drift } = q.data;

  if (editing)
    return (
      <Editor base={editing === "edit" ? (proposal ?? current) : null} start={editing} proposal={proposal} current={current} onClose={() => setEditing(null)} />
    );
  if (view.kind === "review" && proposal)
    return <Review v={proposal} current={current} onBack={() => setView({ kind: "page" })} onEdit={() => setEditing("edit")} />;
  if (view.kind === "versions")
    return <Versions onBack={() => setView({ kind: "page" })} onOpen={(id) => setView(id === proposal?.id ? { kind: "review" } : { kind: "version", id })} />;
  if (view.kind === "version") return <PastVersion id={view.id} onBack={() => setView({ kind: "versions" })} />;

  return (
    <>
      <PageHeader
        title="Agreement"
        subtitle={current ? `Version ${current.number} is in force, agreed ${day(current.agreedAt!)}.` : proposal ? "Nothing agreed yet." : "Not written yet."}
        tools={(current || proposal) && <IconButton icon="history" label="Versions" onClick={() => setView({ kind: "versions" })} />}
      />
      <div className="flex max-w-3xl flex-col gap-8 px-4 pb-12 md:px-6">
        {proposal && <ProposalBanner v={proposal} current={current} onRead={() => setView({ kind: "review" })} onEdit={() => setEditing("edit")} />}
        {proposal && current && <WhatChanged v={proposal} onReadAll={() => setView({ kind: "review" })} />}
        {current && !proposal && drift.length > 0 && <DriftNote drift={drift} onPropose={readOnly ? undefined : () => setEditing("edit")} />}
        {current && !proposal && (
          <>
            <Body v={current} />
            <Signatures v={current} />
            {!readOnly && (
              <div>
                <Button variant="tonal" onClick={() => setEditing("edit")}>
                  Propose changes
                </Button>
              </div>
            )}
          </>
        )}
        {!current && !proposal && !readOnly && (
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => setEditing("template")}>Start from our template</Button>
            <Button variant="text" onClick={() => setEditing("blank")}>
              Start blank
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

/** The changed sections of a proposal, marked, then the unchanged ones named in a line. */
function WhatChanged({ v, onReadAll }: { v: AgreementVersion; onReadAll(): void }) {
  const changed = v.sections.filter((s) => s.change !== "same");
  const same = v.sections.filter((s) => s.change === "same").map((s) => (s.kind === "text" ? s.title : `${s.items.length} ${s.kind}`));
  return (
    <>
      {(changed.length > 0 || v.removed.length > 0) && (
        <section>
          <h2 className="eyebrow">What changed</h2>
          <div className="mt-3 flex flex-col gap-6">
            {changed.map((s) => (
              <SectionView key={s.id} s={s} marked bare={changed.length === 1} />
            ))}
            {v.removed.map((t) => (
              <p key={t} className="font-serif text-[24px] leading-8 text-on-surface-variant line-through">
                {t}
              </p>
            ))}
          </div>
        </section>
      )}
      {same.length > 0 && (
        <section>
          <h2 className="eyebrow">Unchanged</h2>
          <p className="mt-2 text-body-large text-on-surface-variant">{same.join(", ")}</p>
          <button type="button" onClick={onReadAll} className="mt-2 text-label-large text-primary">
            Read all of version {v.number}
          </button>
        </section>
      )}
    </>
  );
}

/** Rules or protocols changed after the version in force was written, so what's signed no longer matches them. */
function DriftNote({ drift, onPropose }: { drift: AgreementDrift[]; onPropose?(): void }) {
  const { rel } = useRel();
  const what = [...new Set(drift.map((d) => (d.kind === "rules" ? "Rules" : "Protocols")))].join(" and ");
  const line = (verb: AgreementDrift["verb"]) => drift.filter((d) => d.verb === verb).map((d) => d.title);
  const added = line("added"),
    removed = line("removed");
  return (
    <section className="border-y border-outline-variant py-4">
      <p className="text-body-large text-on-surface">
        {what} changed since you {rel.members.length > 2 ? "all" : "both"} signed.
      </p>
      {added.length > 0 && <p className="text-body-medium text-on-surface-variant">Added: {added.join(", ")}</p>}
      {removed.length > 0 && <p className="text-body-medium text-on-surface-variant">Removed: {removed.join(", ")}</p>}
      {onPropose && (
        <button type="button" onClick={onPropose} className="mt-2 text-label-large text-primary">
          Propose an update
        </button>
      )}
    </section>
  );
}

/** The open proposal from where the viewer stands, with what they can do about it. */
function ProposalBanner({ v, current, onRead, onEdit }: { v: AgreementVersion; current: AgreementVersion | null; onRead(): void; onEdit(): void }) {
  const { rel, me, memberName, partners } = useRel();
  const snack = useSnackbar();
  const withdraw = useWithdrawAgreement(rel.id);
  const readOnly = useReadOnly();
  const [agreeing, setAgreeing] = useState(false);
  const [asking, setAsking] = useState(false);
  const mine = v.proposedBy === me.user.id;
  const agreed = v.agreements.some((a) => a.userId === me.user.id);
  const waiting = partners.filter((p) => !v.agreements.some((a) => a.userId === p.userId)).map((p) => p.displayName);
  const by = memberName(v.proposedBy);
  const all = rel.members.length > 2 ? "all" : "both";
  const stays = current ? ` Version ${current.number} stays in force until you ${all} agree.` : "";
  return (
    <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-6">
      {v.status === "changes_requested" && v.feedback ? (
        <>
          <p className="text-body-large text-on-surface">
            {v.feedback.userId === me.user.id ? "You" : memberName(v.feedback.userId)} asked for changes to <b className="font-semibold">version {v.number}</b>.
            {stays}
          </p>
          <p className="mt-2 font-serif text-[22px] leading-8 text-on-surface italic">“{v.feedback.note}”</p>
        </>
      ) : (
        <>
          <p className="text-body-large text-on-surface">
            {mine ? "You" : by} proposed <b className="font-semibold">version {v.number}</b>.{stays}
            {mine && waiting.length > 0 && ` Waiting for ${waiting.join(" and ")}.`}
          </p>
          {v.note && <p className="mt-2 font-serif text-[22px] leading-8 text-on-surface italic">“{v.note}”</p>}
        </>
      )}
      {!readOnly && (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {!mine && v.status === "proposed" && !agreed && <Button onClick={() => setAgreeing(true)}>Agree</Button>}
          {!mine && v.status === "proposed" && (
            <Button variant="outlined" onClick={() => setAsking(true)}>
              Ask for changes
            </Button>
          )}
          {(mine || v.status === "changes_requested") && (
            <Button variant="outlined" onClick={onEdit}>
              Edit
            </Button>
          )}
          {!current && (
            <Button variant="text" onClick={onRead}>
              Read it
            </Button>
          )}
          {mine && (
            <Button
              variant="text"
              busy={withdraw.isPending}
              onClick={() => withdraw.mutate(v.id, { onSuccess: () => snack("Proposal withdrawn"), onError: (e) => snack(errorMessage(e)) })}
            >
              Withdraw
            </Button>
          )}
        </div>
      )}
      {agreeing && <AgreeDialog v={v} current={current} onClose={() => setAgreeing(false)} onDone={() => {}} />}
      {asking && <AskChangesDialog v={v} current={current} onClose={() => setAsking(false)} onDone={() => {}} />}
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
      <span className="bg-tertiary-container px-1 [box-decoration-break:clone]">{t}</span>
    ) : (
      <span className="text-on-surface-variant line-through">{t}</span>
    );
  };
  return (
    <>
      {groups.map((g, i) =>
        g.list ? (
          <ul key={i} className="flex flex-col gap-1">
            {g.lines.map((l, j) => (
              <li key={j}>– {text(l)}</li>
            ))}
          </ul>
        ) : (
          g.lines.map((l, j) => <p key={`${i}-${j}`}>{text(l)}</p>)
        ),
      )}
    </>
  );
}

function SectionView({ s, marked, bare }: { s: AgreementSection; marked: boolean; bare?: boolean }) {
  const { features } = useRel();
  return (
    <section className="flex flex-col gap-2">
      {!bare && (
        <h3 className="eyebrow">
          {s.title}
          {marked && s.change === "new" ? " · new" : ""}
        </h3>
      )}
      <div className="flex flex-col gap-3 font-serif text-[24px] leading-[34px] text-on-surface">
        <Lines s={s} marked={marked} />
      </div>
      {s.noteId && s.noteTitle && (
        <Link to="/notes/$noteId" params={{ noteId: s.noteId }} className="flex items-center gap-1.5 self-start text-body-large text-on-surface-variant">
          <Icon name="link" size={18} /> {s.noteTitle}
        </Link>
      )}
      {s.kind === "text" && s.id === "limits" && features.limits && (
        <Link to="/limits" className="flex items-center gap-1.5 self-start text-body-large text-on-surface-variant">
          <Icon name="link" size={18} /> Your limits list
        </Link>
      )}
      {s.kind !== "text" && !s.items.length && <p className="text-body-large text-on-surface-variant">No {s.kind} yet</p>}
    </section>
  );
}

/** The whole page of a version, optionally with what changed marked. */
function Body({ v, marked = false }: { v: AgreementVersion; marked?: boolean }) {
  return (
    <div className="flex flex-col gap-8">
      {v.sections.map((s) => (
        <SectionView key={s.id} s={s} marked={marked} />
      ))}
      {marked &&
        v.removed.map((t) => (
          <p key={t} className="eyebrow line-through">
            {t}
          </p>
        ))}
      {v.reviewBy && (
        <section className="flex flex-col gap-2">
          <h3 className="eyebrow">Review</h3>
          <p className="font-serif text-[24px] leading-[34px] text-on-surface">
            We'll read this again together by {fmtDate(v.reviewBy, { month: "short", day: "numeric", year: "numeric" })}.
          </p>
        </section>
      )}
    </div>
  );
}

/** Each person on a hairline: their name in the serif italic once they've agreed. */
function Signatures({ v }: { v: AgreementVersion }) {
  const { rel } = useRel();
  return (
    <section>
      <h3 className="eyebrow">Agreed by</h3>
      <div className="mt-2 divide-y divide-outline-variant border-y border-outline-variant">
        {rel.members.map((m) => {
          const a = v.agreements.find((x) => x.userId === m.userId);
          return (
            <div key={m.userId} className="flex items-baseline gap-3 py-3">
              {a ? (
                <span className="min-w-0 flex-1 font-serif text-[26px] text-on-surface italic">{m.displayName}</span>
              ) : (
                <span className="min-w-0 flex-1 text-body-large text-on-surface-variant">Waiting for {m.displayName}</span>
              )}
              {a && <span className="text-body-medium text-on-surface-variant">{day(a.agreedAt)}</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Reading a proposal in full, with what changed marked. */
function Review({ v, current, onBack, onEdit }: { v: AgreementVersion; current: AgreementVersion | null; onBack(): void; onEdit(): void }) {
  const { memberName } = useRel();
  const by = memberName(v.proposedBy);
  return (
    <SubPage back="Agreement" onBack={onBack} title={`Version ${v.number}`} subtitle={`Proposed by ${by === "You" ? "you" : by} ${day(v.proposedAt)}`}>
      <ProposalBanner v={v} current={current} onRead={() => {}} onEdit={onEdit} />
      {v.feedback && v.status !== "changes_requested" && (
        <p className="border-l-2 border-outline-variant pl-4 text-body-large text-on-surface-variant">
          {memberName(v.feedback.userId)} asked for changes: <span className="font-serif italic">“{v.feedback.note}”</span>
        </p>
      )}
      <Body v={v} marked={!!current} />
      <Signatures v={v} />
    </SubPage>
  );
}

/** A page under Agreement: "‹ Agreement", a serif title and a line under it. */
function SubPage({ back, onBack, title, subtitle, children }: { back: string; onBack(): void; title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="flex max-w-3xl flex-col px-4 pt-3 pb-12 md:px-6 md:pt-6">
      <div className="-mx-2">
        <BackLink label={back} onClick={onBack} />
      </div>
      <h1 className="mt-3 font-serif text-[56px] leading-[60px] text-on-surface">{title}</h1>
      {subtitle && <p className="mt-2 text-body-large text-on-surface-variant">{subtitle}</p>}
      <div className="mt-8 flex flex-col gap-8">{children}</div>
    </div>
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

/** Mockup 75: every version on hairlines, the open one to review, the rest to read. */
function Versions({ onBack, onOpen }: { onBack(): void; onOpen(id: string): void }) {
  const { rel, me, memberName } = useRel();
  const q = useAgreement(rel.id);
  const by = (id: string | null) => memberName(id).replace(/^You$/, "you");
  const versions = q.data?.versions ?? [];
  const short = (iso: string) => fmtDate(localDateOf(new Date(iso)), { month: "short", day: "numeric" });
  return (
    <SubPage back="Agreement" onBack={onBack} title="Versions" subtitle="Old versions stay readable, with what changed in each.">
      <div className="-mt-4 divide-y divide-outline-variant border-b border-outline-variant">
        {versions.map((v, i) => {
          const open = v.status === "proposed" || v.status === "changes_requested";
          const full = q.data?.proposal?.id === v.id ? q.data.proposal : null;
          const waitingOnMe = !!full && full.status === "proposed" && full.proposedBy !== me.user.id && !full.agreements.some((a) => a.userId === me.user.id);
          // A superseded version ran from its own agreement to the next one's.
          const until = versions
            .slice(0, i)
            .reverse()
            .find((x) => x.agreedAt)?.agreedAt;
          const line = open
            ? `Proposed by ${by(v.proposedBy)} · ${v.status === "changes_requested" ? "changes asked for" : waitingOnMe ? "waiting on you" : "waiting"}`
            : v.status === "agreed"
              ? `In force since ${short(v.agreedAt!)} · agreed by ${rel.members.length > 2 ? "everyone" : "both"}`
              : v.agreedAt
                ? `${short(v.agreedAt)} – ${until ? short(until) : "replaced"}`
                : `Proposed by ${by(v.proposedBy)} ${short(v.proposedAt)}`;
          return (
            <div key={v.id} className="flex items-center gap-4 py-5">
              <div className="min-w-0 flex-1">
                <div className="font-serif text-[30px] leading-9 text-on-surface">Version {v.number}</div>
                <div className="text-body-large text-on-surface-variant">{line}</div>
              </div>
              {waitingOnMe ? (
                <Button onClick={() => onOpen(v.id)}>Review</Button>
              ) : (
                <button type="button" onClick={() => onOpen(v.id)} className="text-label-large text-primary">
                  Read
                </button>
              )}
            </div>
          );
        })}
      </div>
    </SubPage>
  );
}

function PastVersion({ id, onBack }: { id: string; onBack(): void }) {
  const q = useAgreementVersion(id);
  const v = q.data;
  return (
    <SubPage
      back="Versions"
      onBack={onBack}
      title={v ? `Version ${v.number}` : "Version"}
      subtitle={v ? (v.agreedAt ? `Agreed ${day(v.agreedAt)}` : `Proposed ${day(v.proposedAt)}`) : undefined}
    >
      {q.isLoading && <Loading />}
      {q.error && <ErrorBox error={q.error} onRetry={() => q.refetch()} />}
      {v && (
        <>
          <Body v={v} marked={v.number > 1} />
          <Signatures v={v} />
        </>
      )}
    </SubPage>
  );
}

let nextId = 0;
const freshId = () => `s-${Date.now().toString(36)}-${nextId++}`;

/** Mockup 74: proposing a version, each section an eyebrow over its words; Rules and Protocols come in as they stand. */
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
  const rules = useLibrary(rel.id, "rules", features.rules);
  const protocols = useLibrary(rel.id, "protocols", features.protocols);
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
  const count = (kind: "rules" | "protocols") => (kind === "rules" ? rules.data : protocols.data)?.length;
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
      <div className="grid h-16 grid-cols-[1fr_auto_1fr] items-center px-4 md:px-6">
        <button type="button" onClick={onClose} className="justify-self-start text-body-large text-on-surface-variant">
          Cancel
        </button>
        <h1 className="text-title-medium text-on-surface">Propose version {number}</h1>
        <button
          type="button"
          disabled={!valid || propose.isPending}
          onClick={send}
          className="justify-self-end text-body-large text-primary disabled:opacity-40"
        >
          Send
        </button>
      </div>
      <div className="flex flex-col gap-7 px-4 pb-12 md:px-6">
        {!list && <Loading />}
        {list?.map((s, i) => (
          <section key={s.id} className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <input
                aria-label="Section title"
                value={s.title}
                maxLength={80}
                onChange={(e) => update(i, { title: e.target.value })}
                className="eyebrow min-w-0 flex-1 bg-transparent outline-none"
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
              <>
                {s.id === "limits" && features.limits && (
                  <Link to="/limits" className="flex items-center gap-1.5 self-start text-body-large text-on-surface-variant">
                    <Icon name="link" size={18} /> Links to your limits list
                  </Link>
                )}
                <textarea
                  aria-label={s.title}
                  rows={1}
                  value={s.body}
                  maxLength={5000}
                  placeholder="Start a line with - for a bullet"
                  onChange={(e) => update(i, { body: e.target.value })}
                  className="min-h-[68px] w-full resize-none bg-transparent font-serif text-[24px] [field-sizing:content] leading-[34px] text-on-surface outline-none placeholder:text-on-surface-variant"
                />
              </>
            ) : (
              <p className="text-body-large text-on-surface-variant">
                {count(s.kind) ?? "The"} {s.kind === "rules" ? (count(s.kind) === 1 ? "rule" : "rules") : count(s.kind) === 1 ? "protocol" : "protocols"}, taken
                from{" "}
                <Link to={s.kind === "rules" ? "/rules" : "/protocols"} className="text-primary">
                  {s.kind === "rules" ? "Rules" : "Protocols"}
                </Link>{" "}
                when you send
              </p>
            )}
            {s.noteId && <div className="text-body-medium text-on-surface-variant">Links to a note</div>}
          </section>
        ))}
        {list && (
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <button
              type="button"
              onClick={() => set([...list, { id: freshId(), kind: "text", title: "New section", body: "", noteId: null }])}
              className="text-label-large text-primary"
            >
              + Add a section
            </button>
            {features.rules && !has("rules") && (
              <button
                type="button"
                onClick={() => set([...list, { id: "rules", kind: "rules", title: "Rules", body: "", noteId: null }])}
                className="text-label-large text-primary"
              >
                + Add the rules
              </button>
            )}
            {features.protocols && !has("protocols") && (
              <button
                type="button"
                onClick={() => set([...list, { id: "protocols", kind: "protocols", title: "Protocols", body: "", noteId: null }])}
                className="text-label-large text-primary"
              >
                + Add the protocols
              </button>
            )}
          </div>
        )}
        <TextField label="Review by (optional)" type="date" value={reviewBy} onChange={(e) => setReviewBy(e.target.value)} className="max-w-xs" />
        <TextArea label={`What changed, for ${names}`} value={note} maxLength={500} rows={2} onChange={(e) => setNote(e.target.value)} />
      </div>
    </div>
  );
}
