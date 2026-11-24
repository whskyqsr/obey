import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useLibrary, useSaveLibraryItem } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Note } from "../api/types";
import { MOODS, MOOD_LABELS, MoodCard } from "../components/Mood";
import { Chip, Empty, ErrorBox, Fab, Icon, IconButton, Loading, PageHeader, SegmentedButtons, TextField, cx, useSnackbar } from "../components/ui";
import { fmtDate, fmtDateTime, localDateOf } from "../lib/dates";
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

const COPY = {
  note: {
    title: "Notes",
    subtitle: "Plans, ideas, lists and anything else worth writing down.",
    search: "Search notes",
    empty: "No notes yet",
    icon: "sticky_note_2",
    fab: "New note",
    base: "/notes",
  },
  journal: {
    title: "Journal",
    subtitle: "Dated entries about how things are going.",
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
  const split = useMediaQuery(SPLIT) && kind === "note";
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
      body={q || tag ? undefined : canWrite ? "Start one with the + above." : undefined}
    />
  );

  const noteRow = (n: Note, current?: boolean) => (
    <button
      key={n.id}
      type="button"
      onClick={() => openNote(n.id)}
      aria-current={current || undefined}
      className={cx("state-layer flex w-full flex-col gap-0.5 py-4 text-left", split && "rounded-md px-3", current && "bg-surface-container")}
    >
      <span className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate font-serif text-[24px] leading-8 text-on-surface">{n.title || "Untitled"}</span>
        {n.pinned && <Icon name="push_pin" filled size={16} className="text-on-surface-variant" />}
      </span>
      <span className="text-body-small text-on-surface-variant">{noteMeta(n)}</span>
    </button>
  );

  // A blank page shown on /notes moves to /notes/new first, so saving it doesn't swap the editor out mid-sentence.
  const blank = split && !selected && !list.length && canWrite && !!notes.data && !q && !tag;
  useEffect(() => {
    if (blank) void navigate({ to: "/notes/$noteId", params: { noteId: "new" }, replace: true });
  }, [blank, navigate]);

  if (split) {
    // The open note: the one in the address, else the top of the list (or a blank one to write in when there are none).
    const current = selected ?? list[0]?.id ?? (canWrite && notes.data && !q && !tag ? "new" : undefined);
    return (
      <div className="-mb-10 flex min-h-dvh">
        <section className="sticky top-0 flex h-dvh w-[340px] shrink-0 flex-col overflow-y-auto border-r border-outline-variant px-6 pt-6 pb-6">
          <div className="flex items-center gap-2">
            <h1 className="min-w-0 flex-1 text-display-small text-on-surface">{copy.title}</h1>
            {canWrite && !rel.endedAt && (
              <button
                type="button"
                onClick={newEntry}
                aria-label={copy.fab}
                title={copy.fab}
                className="state-layer flex size-11 items-center justify-center rounded-md bg-on-surface text-surface"
              >
                <Icon name="add" />
              </button>
            )}
          </div>
          <label className="mt-4 flex h-11 items-center gap-2 border-b border-outline-variant text-on-surface-variant">
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
          {tagChips && <div className="mt-3">{tagChips}</div>}
          {notes.isLoading && <Loading />}
          {notes.error && <ErrorBox error={notes.error} onRetry={() => notes.refetch()} />}
          {empty}
          <div className="mt-2 flex flex-col divide-y divide-outline-variant">{list.map((n) => noteRow(n, n.id === current))}</div>
        </section>
        <div className="min-w-0 flex-1">
          {current && (
            <Suspense fallback={<Loading />}>
              <NoteEditorPage noteId={current} kind="note" />
            </Suspense>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={copy.title}
        actions={
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
            {kind === "journal" && (
              <IconButton
                icon="show_chart"
                label={chart ? "Hide the mood chart" : "Show the mood chart"}
                aria-pressed={chart}
                onClick={() => setChart(!chart)}
              />
            )}
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
        {kind === "note"
          ? list.map((n) => noteRow(n))
          : list.map((n) => (
              <div key={n.id} className="group relative flex flex-col gap-1.5 py-4">
                <button type="button" className="state-layer absolute inset-0" aria-label={`Open ${n.title || "entry"}`} onClick={() => openNote(n.id)} />
                <div className="eyebrow pointer-events-none flex items-center gap-1.5">
                  {n.mood && <Icon name={MOODS[n.mood - 1]!} size={16} />}
                  {n.visibility === "private" && <Icon name="lock" size={14} />}
                  <span>
                    {fmtDate(localDateOf(new Date(n.createdAt)), { weekday: "long", month: "short", day: "numeric" })}
                    {n.mood ? ` · feeling ${MOOD_LABELS[n.mood - 1]!.toLowerCase()}` : ""}
                    {n.authorId !== me.user.id ? ` · ${memberName(n.authorId)}` : ""}
                  </span>
                </div>
                {n.title && n.title !== "Untitled" && <div className="pointer-events-none text-title-medium text-on-surface">{n.title}</div>}
                {n.bodyMd && <p className="pointer-events-none line-clamp-4 font-serif text-[23px] leading-8 text-on-surface">{excerpt(n.bodyMd, 280)}</p>}
                {(n.tags.length > 0 || n.commentCount > 0) && (
                  <div className="pointer-events-none flex flex-wrap items-center gap-2 text-label-medium text-on-surface-variant">
                    {n.tags.map((t) => (
                      <span key={t}>#{t}</span>
                    ))}
                    {n.commentCount > 0 && (
                      <span className="flex items-center gap-0.5 text-primary">
                        <Icon name="chat_bubble" size={14} /> {n.commentCount === 1 ? "1 reply" : `${n.commentCount} replies`}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
      </div>
      {canWrite && <Fab icon="edit" label={copy.fab} onClick={newEntry} />}
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
