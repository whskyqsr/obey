import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useLibrary, useSaveLibraryItem } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Note } from "../api/types";
import { MOODS, MOOD_LABELS, MoodCard } from "../components/Mood";
import { Chip, Empty, ErrorBox, Fab, Icon, IconButton, Loading, PageHeader, SegmentedButtons, TextField, cx, useSnackbar } from "../components/ui";
import { fmtDate, fmtDateTime, localDateOf } from "../lib/dates";
import { useRel } from "../lib/relationship";

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
export function NotesPage({ kind }: { kind: "note" | "journal" }) {
  const copy = COPY[kind];
  const { rel, me, memberName, isDom, features } = useRel();
  // Journal has its own feature switch; notes from a submissive are up to their Dominant.
  const canWrite = kind === "journal" || isDom || rel.subNotes;
  const navigate = useNavigate();
  const snack = useSnackbar();
  const notes = useLibrary(rel.id, "notes");
  const save = useSaveLibraryItem(rel.id, "notes");
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const tags = useMemo(() => [...new Set((notes.data ?? []).filter((n) => n.kind === kind).flatMap((n) => n.tags))].sort(), [notes.data, kind]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (
      (notes.data ?? [])
        .filter((n) => n.kind === kind)
        .filter((n) => !tag || n.tags.includes(tag))
        .filter((n) => !needle || n.title.toLowerCase().includes(needle) || n.bodyMd.toLowerCase().includes(needle) || n.tags.some((t) => t.toLowerCase().includes(needle)))
        // The journal reads as a timeline; notes keep pinned ones on top.
        .sort((a, b) => (kind === "journal" ? b.createdAt.localeCompare(a.createdAt) : Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt)))
    );
  }, [notes.data, q, tag, kind]);

  const togglePin = (n: Note) => save.mutate({ id: n.id, input: { pinned: !n.pinned } }, { onError: (e) => snack(errorMessage(e)) });

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
        tools={<IconButton icon="search" label={copy.search} onClick={() => setSearching((v) => !v)} />}
      />
      <div className="flex flex-col gap-3 px-4 pb-4 md:px-6">
        {(searching || q) && <TextField autoFocus placeholder={copy.search} value={q} onChange={(e) => setQ(e.target.value)} aria-label={copy.search} type="search" />}
        {kind === "journal" && !q && !tag && <MoodCard />}
        {tags.length > 0 && (
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
        )}
      </div>
      {notes.isLoading && <Loading />}
      {notes.error && <ErrorBox error={notes.error} onRetry={() => notes.refetch()} />}
      {notes.data && !list.length && (
        <div className="px-4 md:px-6">
          <Empty icon={copy.icon} title={q || tag ? "Nothing matches" : copy.empty} body={q || tag ? undefined : canWrite ? "Start one with the + above." : undefined} />
        </div>
      )}
      {/* Letters: entries on hairlines like pages of a notebook, not cards. */}
      <div className={cx("mx-4 flex max-w-3xl flex-col divide-y divide-outline-variant md:mx-6", list.length > 0 && "border-t border-outline-variant")}>
        {list.map((n) => (
          <div key={n.id} className="group relative flex flex-col gap-1.5 py-4">
            <button
              type="button"
              className="state-layer absolute inset-0"
              aria-label={`Open ${n.title || "note"}`}
              onClick={() => navigate({ to: `${copy.base}/$noteId`, params: { noteId: n.id } })}
            />
            {/* Content lets clicks through to the open button underneath; only the pin takes its own. */}
            <div className="pointer-events-none flex items-start gap-2">
              <div className="min-w-0 flex-1">
                {kind === "journal" ? (
                  <div className="eyebrow flex items-center gap-1.5">
                    {n.mood && <Icon name={MOODS[n.mood - 1]!} size={16} />}
                    {n.visibility === "private" && <Icon name="lock" size={14} />}
                    <span>
                      {fmtDate(localDateOf(new Date(n.createdAt)), { weekday: "long", month: "short", day: "numeric" })}
                      {n.mood ? ` · feeling ${MOOD_LABELS[n.mood - 1]!.toLowerCase()}` : ""}
                      {n.authorId !== me.user.id ? ` · ${memberName(n.authorId)}` : ""}
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5">
                      {n.visibility === "private" && <Icon name="lock" size={16} className="text-on-surface-variant" />}
                      <span className="truncate font-serif text-[24px] leading-8 text-on-surface">{n.title || "Untitled"}</span>
                    </div>
                    <div className="text-body-small text-on-surface-variant">
                      {n.visibility === "private" ? "Private" : "Shared"}
                      {n.authorId !== me.user.id ? ` · ${memberName(n.authorId)}` : ""} · {fmtDate(localDateOf(new Date(n.updatedAt)), { month: "short", day: "numeric" })}
                    </div>
                  </>
                )}
              </div>
              {/* Pinning changes the note, so only its author can; others just see that it's pinned. */}
              {kind === "note" &&
                (n.authorId === me.user.id && n.canEdit ? (
                  <div className="pointer-events-auto relative">
                    <IconButton icon="push_pin" filled={n.pinned} label={n.pinned ? "Unpin" : "Pin"} onClick={() => togglePin(n)} />
                  </div>
                ) : (
                  n.pinned && <Icon name="push_pin" filled size={20} className="m-2.5" />
                ))}
            </div>
            {kind === "journal" && n.title && n.title !== "Untitled" && <div className="pointer-events-none text-title-medium text-on-surface">{n.title}</div>}
            {kind === "journal" && n.bodyMd && (
              <p
                className={cx(
                  "pointer-events-none line-clamp-4",
                  kind === "journal" ? "font-serif text-[21px] leading-7 text-on-surface" : "text-body-medium text-on-surface-variant",
                )}
              >
                {excerpt(n.bodyMd, 280)}
              </p>
            )}
            {kind === "journal" && (n.tags.length > 0 || n.commentCount > 0) && (
              <div className="pointer-events-none flex flex-wrap items-center gap-2 text-label-medium text-on-surface-variant">
                {n.tags.map((t) => (
                  <span key={t}>#{t}</span>
                ))}
                {kind === "journal" && n.commentCount > 0 && (
                  <span className="flex items-center gap-0.5 text-primary">
                    <Icon name="chat_bubble" size={14} /> {n.commentCount === 1 ? "1 reply" : `${n.commentCount} replies`}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {canWrite && <Fab icon="edit" label={copy.fab} onClick={() => navigate({ to: `${copy.base}/$noteId`, params: { noteId: "new" } })} />}
    </>
  );
}
