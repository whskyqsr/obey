import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useLibrary, useNoteComments } from "../api/hooks";
import type { Note } from "../api/types";
import { MOOD_LABELS, MoodCard } from "../components/Mood";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { Chip, Empty, ErrorBox, Fab, Icon, IconButton, Loading, PageHeader, SegmentedButtons, TextField, cx } from "../components/ui";
import { fmtDate, localDateOf } from "../lib/dates";
import { useRel } from "../lib/relationship";
import { storage } from "../lib/storage";
import { importPage } from "../lib/staleBuild";
import { useMediaQuery } from "../lib/useMediaQuery";

const NoteEditorPage = lazy(importPage(() => import("./NoteEditor").then((m) => ({ default: m.NoteEditorPage }))));

/** Wide screens show notes as a list beside the open note, as in the desktop mockup. */
const SPLIT = "(min-width: 1024px)";

/** A note's address: on wide screens the list stays beside it; on phones it's a page of its own. */
export function NoteRoutePage({ noteId }: { noteId: string }) {
  const split = useMediaQuery(SPLIT);
  return split ? (
    <NotesPage kind="note" selected={noteId} />
  ) : (
    <Suspense fallback={<Loading />}>
      <NoteEditorPage noteId={noteId} kind="note" />
    </Suspense>
  );
}

/** "today", "yesterday", or a short date. */
export function dayWord(iso: string) {
  const d = localDateOf(new Date(iso));
  if (d === localDateOf(new Date())) return "today";
  if (d === localDateOf(new Date(Date.now() - 86_400_000))) return "yesterday";
  return fmtDate(d, { month: "short", day: "numeric" });
}

/** Plain-text preview of a Markdown body. */
export function excerpt(md: string, max = 160): string {
  const text = md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s*(#{1,6}\s+|>\s?|[-*+]\s+(\[[ xX]\]\s+)?|\d+\.\s+)/gm, "")
    .replace(/[*_~`]/g, "")
    // Keep line breaks visible so lists and headings don't run together.
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" · ");
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

const entryDay = (n: Note, weekday: "long" | "short" = "long") => fmtDate(localDateOf(new Date(n.createdAt)), { weekday, month: "short", day: "numeric" });
const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/** The partner's latest reply to a journal entry; fetched only when the entry has replies. */
function usePartnerReply(n: Note) {
  const comments = useNoteComments(n.id, n.commentCount > 0);
  return (comments.data ?? [])
    .filter((c) => c.authorId !== n.authorId)
    .reduce<(typeof comments.data & {})[number] | undefined>((last, c) => (!last || c.createdAt > last.createdAt ? c : last), undefined);
}

/** A reply quoted under its entry with an accent rule, as in mockups 07 and 15. */
function ReplyQuote({ n, large }: { n: Note; large?: boolean }) {
  const { memberName } = useRel();
  const reply = usePartnerReply(n);
  if (!reply) return null;
  return (
    <blockquote className={cx("border-l-2 border-primary", large ? "mt-6 pl-6" : "mt-3 ml-6 pl-5")}>
      <p className={cx("font-serif text-on-surface italic", large ? "text-[26px] leading-10" : "text-[20px] leading-7")}>
        “{excerpt(reply.body, large ? 600 : 220)}”
      </p>
      <p className="mt-1.5 text-body-small text-on-surface-variant">
        {memberName(reply.authorId)} · {clock(reply.createdAt)}
      </p>
    </blockquote>
  );
}

/** A journal entry in the list: its day, mood and who replied over the start of what it says, as in the header mockups. */
function JournalRow({ n, current, onOpen }: { n: Note; current?: boolean; onOpen(): void }) {
  const { me, memberName } = useRel();
  const reply = usePartnerReply(n);
  const meta = [
    entryDay(n, "short"),
    n.mood ? MOOD_LABELS[n.mood - 1]!.toLowerCase() : null,
    n.authorId !== me.user.id ? memberName(n.authorId) : null,
    n.visibility === "private" ? "Private" : null,
    reply ? `${memberName(reply.authorId)} replied` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={current || undefined}
      className={cx("state-layer state-row flex w-full flex-col gap-1 px-4 py-4 text-left", current && "bg-surface-container")}
    >
      <span className="truncate text-body-small text-on-surface-variant">{meta}</span>
      <span className="line-clamp-2 font-serif text-[21px] leading-7 text-on-surface-variant">{excerpt(n.bodyMd, 160) || n.title || "Untitled"}</span>
    </button>
  );
}

const COPY = {
  note: {
    title: "Notes",
    search: "Search notes",
    empty: "No notes yet",
    icon: "sticky_note_2",
    fab: "New note",
    base: "/notes",
  },
  journal: {
    title: "Journal",
    search: "Search the journal",
    empty: "No entries yet",
    icon: "auto_stories",
    fab: "New entry",
    base: "/journal",
  },
} as const;

/** Notes and the journal share storage but are separate lists, told apart by `kind`. */
export function NotesPage({ kind, selected }: { kind: "note" | "journal"; selected?: string }) {
  const copy = COPY[kind];
  const { rel, me, memberName, isDom, features } = useRel();
  // Journal has its own feature switch; notes from a submissive are up to their Dominant.
  const canWrite = kind === "journal" || isDom || rel.subNotes;
  const navigate = useNavigate();
  const notes = useLibrary(rel.id, "notes");
  const wide = useMediaQuery(SPLIT);
  const split = wide && kind === "note";
  const [shown, setShown] = useState<string>();
  const sub = rel.members.find((m) => m.role === "submissive");
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  // The mood chart sits behind its own header button, as in the mockup; the list leads.
  const [chart, setChartState] = useState(() => storage.get("obey.journal.chart") === "1");
  const setChart = (on: boolean) => {
    storage.set("obey.journal.chart", on ? "1" : "0");
    setChartState(on);
  };
  const newEntry = () => navigate({ to: `${copy.base}/$noteId`, params: { noteId: "new" } });
  const openNote = (id: string) => navigate({ to: `${copy.base}/$noteId`, params: { noteId: id } });

  const tags = useMemo(() => [...new Set((notes.data ?? []).filter((n) => n.kind === kind).flatMap((n) => n.tags))].sort(), [notes.data, kind]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (
      (notes.data ?? [])
        .filter((n) => n.kind === kind)
        .filter((n) => !tag || n.tags.includes(tag))
        .filter(
          (n) =>
            !needle ||
            n.title.toLowerCase().includes(needle) ||
            n.bodyMd.toLowerCase().includes(needle) ||
            n.tags.some((t) => t.toLowerCase().includes(needle)),
        )
        // The journal reads as a timeline; notes keep pinned ones on top.
        .sort((a, b) =>
          kind === "journal" ? b.createdAt.localeCompare(a.createdAt) : Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt),
        )
    );
  }, [notes.data, q, tag, kind]);

  // A note's line under its title: who can see it, who else can change it, when it last changed.
  const noteMeta = (n: Note) =>
    [
      n.visibility === "private" ? "Private" : "Shared",
      n.visibility === "shared" && n.subCanEdit && sub && sub.userId !== me.user.id ? `${sub.displayName} can edit` : null,
      n.authorId !== me.user.id ? memberName(n.authorId) : null,
      dayWord(n.updatedAt),
    ]
      .filter(Boolean)
      .join(" · ");

  const tagChips = tags.length > 0 && (
    <div className="flex gap-2 overflow-x-auto pb-1">
      <Chip selected={!tag} onClick={() => setTag(null)}>
        All
      </Chip>
      {tags.map((t) => (
        <Chip key={t} selected={tag === t} onClick={() => setTag(tag === t ? null : t)}>
          {t}
        </Chip>
      ))}
    </div>
  );

  const empty = notes.data && !list.length && (
    <Empty
      icon={copy.icon}
      title={q || tag ? "Nothing matches" : copy.empty}
      
    />
  );

  const noteRow = (n: Note, current?: boolean) => (
    <button
      key={n.id}
      type="button"
      onClick={() => openNote(n.id)}
      aria-current={current || undefined}
      className={cx("state-layer state-row flex w-full flex-col gap-0.5 px-4 py-4 text-left", current && "bg-surface-container")}
    >
      <span className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate font-serif text-[24px] leading-8 text-on-surface">{n.title || "Untitled"}</span>
        {n.pinned && <Icon name="push_pin" filled size={16} className="text-on-surface-variant" />}
      </span>
      <span className="text-body-small text-on-surface-variant">{noteMeta(n)}</span>
    </button>
  );

  const chartButton = kind === "journal" && (
    <IconButton icon="show_chart" label={chart ? "Hide the mood chart" : "Show the mood chart"} aria-pressed={chart} onClick={() => setChart(!chart)} />
  );
  const rows =
    kind === "note"
      ? (current?: string) => list.map((n) => noteRow(n, n.id === current))
      : (current?: string) => list.map((n) => <JournalRow key={n.id} n={n} current={n.id === current} onOpen={() => (wide ? setShown(n.id) : openNote(n.id))} />);

  // A blank page shown on /notes moves to /notes/new first, so saving it doesn't swap the editor out mid-sentence.
  const blank = split && !selected && !list.length && canWrite && !!notes.data && !q && !tag;
  useEffect(() => {
    if (blank) void navigate({ to: "/notes/$noteId", params: { noteId: "new" }, replace: true });
  }, [blank, navigate]);

  if (wide) {
    // Notes and the journal share one desktop layout: the list in a column with the page header, the open one beside it.
    const current = kind === "note" ? (selected ?? list[0]?.id ?? (canWrite && notes.data && !q && !tag ? "new" : undefined)) : undefined;
    const entry = kind === "journal" ? (list.find((n) => n.id === shown) ?? list[0]) : undefined;
    const mine = entry?.authorId === me.user.id;
    return (
      <div className="-mb-10 flex min-h-dvh">
        <section className="sticky top-0 flex h-dvh w-[360px] shrink-0 flex-col overflow-y-auto border-r border-outline-variant pb-6">
          <PageHeader title={copy.title} tools={chartButton} />
          <div className="px-6">
            <label className="flex h-12 items-center gap-2 border-y border-outline-variant text-on-surface-variant">
              <Icon name="search" size={20} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search"
                aria-label={copy.search}
                type="search"
                className="min-w-0 flex-1 bg-transparent text-body-large text-on-surface outline-none placeholder:text-on-surface-variant"
              />
            </label>
            {chart && kind === "journal" && !q && !tag && (
              <div className="mt-3">
                <MoodCard />
              </div>
            )}
            {tagChips && <div className="mt-3">{tagChips}</div>}
            {notes.isLoading && <Loading />}
            {notes.error && <ErrorBox error={notes.error} onRetry={() => notes.refetch()} />}
            {empty}
            <div className="flex flex-col divide-y divide-outline-variant">{rows(kind === "note" ? current : entry?.id)}</div>
          </div>
          {canWrite && <Fab icon="add" label={copy.fab} onClick={newEntry} />}
        </section>
        <div className="min-w-0 flex-1">
          {kind === "note" && current && (
            <Suspense fallback={<Loading />}>
              <NoteEditorPage noteId={current} kind="note" />
            </Suspense>
          )}
          {entry && (
            <article className="px-16 pt-6 pb-16">
              <div className="mx-auto max-w-[720px]">
                <div className="-mx-2 flex min-h-10 items-center justify-end">
                  <IconButton icon={mine ? "edit" : "reply"} label={mine ? "Edit" : "Reply"} onClick={() => openNote(entry.id)} />
                </div>
                <h2 className="font-serif text-[56px] leading-[1.05] text-on-surface">{entryDay(entry)}</h2>
                <p className="mt-2 text-body-medium text-on-surface-variant">
                  {[
                    mine ? null : memberName(entry.authorId),
                    entry.mood ? `feeling ${MOOD_LABELS[entry.mood - 1]!.toLowerCase()}` : null,
                    entry.visibility === "private" ? "Private" : null,
                    `written ${clock(entry.createdAt)}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {entry.title && entry.title !== "Untitled" && <h3 className="mt-8 text-title-large text-on-surface">{entry.title}</h3>}
                <div className="mt-6">
                  <MarkdownEditor key={entry.id} value={entry.bodyMd} onChange={() => {}} editable={false} letters />
                </div>
                <ReplyQuote n={entry} large />
              </div>
            </article>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={copy.title}
        tabs={
          features.journal ? (
            <SegmentedButtons
              value={kind}
              onChange={(v) => void navigate({ to: v === "note" ? "/notes" : "/journal" })}
              options={[
                { value: "note", label: "Notes" },
                { value: "journal", label: "Journal" },
              ]}
            />
          ) : undefined
        }
        tools={
          <>
            <IconButton icon="search" label={copy.search} onClick={() => setSearching((v) => !v)} />
            {chartButton}
          </>
        }
      />
      <div className="flex flex-col gap-3 px-4 pb-4 md:px-6">
        {(searching || q) && (
          <TextField autoFocus placeholder={copy.search} value={q} onChange={(e) => setQ(e.target.value)} aria-label={copy.search} type="search" />
        )}
        {kind === "journal" && chart && !q && !tag && <MoodCard />}
        {tagChips}
      </div>
      {notes.isLoading && <Loading />}
      {notes.error && <ErrorBox error={notes.error} onRetry={() => notes.refetch()} />}
      {empty && <div className="px-4 md:px-6">{empty}</div>}
      {/* Letters: entries on hairlines like pages of a notebook, not cards. */}
      <div className={cx("mx-4 flex max-w-3xl flex-col divide-y divide-outline-variant md:mx-6", list.length > 0 && "border-t border-outline-variant")}>
        {rows()}
      </div>
      {canWrite && <Fab icon="add" label={copy.fab} onClick={newEntry} />}
      {kind === "journal" && canWrite && (
        <>
          {/* Phones: tonight's entry starts from a bar above the tabs, as in the mockup. */}
          <div className="h-24 md:hidden" aria-hidden />
          <div className="fixed inset-x-0 bottom-[calc(68px+env(safe-area-inset-bottom))] z-20 flex items-center gap-3 border-t border-outline-variant bg-surface px-5 pt-3 pb-8 md:hidden">
            <button type="button" onClick={newEntry} className="min-w-0 flex-1 truncate text-left font-serif text-[22px] text-on-surface-variant italic">
              Write tonight's entry…
            </button>
            <button
              type="button"
              onClick={newEntry}
              className="shrink-0 rounded-full border border-outline-variant px-4 py-1.5 text-label-large text-on-surface-variant"
            >
              Mood
            </button>
          </div>
        </>
      )}
    </>
  );
}
