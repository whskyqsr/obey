import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useLibrary, useSaveLibraryItem } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Note } from "../api/types";
import { Chip, Empty, ErrorBox, Fab, Icon, IconButton, Loading, PageHeader, TextField, cx, useSnackbar } from "../components/ui";
import { fmtDateTime } from "../lib/dates";
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
    subtitle: "Limits, aftercare plans and anything else worth writing down.",
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

const MOODS = ["sentiment_very_dissatisfied", "sentiment_dissatisfied", "sentiment_neutral", "sentiment_satisfied", "sentiment_very_satisfied"];

/** Notes and the journal share storage but are separate lists, told apart by `kind`. */
export function NotesPage({ kind }: { kind: "note" | "journal" }) {
  const copy = COPY[kind];
  const { rel, memberName } = useRel();
  const navigate = useNavigate();
  const snack = useSnackbar();
  const notes = useLibrary(rel.id, "notes");
  const save = useSaveLibraryItem(rel.id, "notes");
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);

  const tags = useMemo(() => [...new Set((notes.data ?? []).filter((n) => n.kind === kind).flatMap((n) => n.tags))].sort(), [notes.data, kind]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (notes.data ?? [])
      .filter((n) => n.kind === kind)
      .filter((n) => !tag || n.tags.includes(tag))
      .filter((n) => !needle || n.title.toLowerCase().includes(needle) || n.bodyMd.toLowerCase().includes(needle) || n.tags.some((t) => t.toLowerCase().includes(needle)))
      // The journal reads as a timeline; notes keep pinned ones on top.
      .sort((a, b) => (kind === "journal" ? b.createdAt.localeCompare(a.createdAt) : Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt)));
  }, [notes.data, q, tag, kind]);

  const togglePin = (n: Note) =>
    save.mutate({ id: n.id, input: { pinned: !n.pinned } }, { onError: (e) => snack(errorMessage(e)) });

  return (
    <>
      <PageHeader title={copy.title} subtitle={copy.subtitle} />
      <div className="flex flex-col gap-3 px-4 pb-4 md:px-6">
        <TextField placeholder={copy.search} value={q} onChange={(e) => setQ(e.target.value)} aria-label={copy.search} type="search" />
        {tags.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {tags.map((t) => (
              <Chip key={t} selected={tag === t} onClick={() => setTag(tag === t ? null : t)}>
                #{t}
              </Chip>
            ))}
          </div>
        )}
      </div>
      {notes.isLoading && <Loading />}
      {notes.error && <ErrorBox error={notes.error} onRetry={() => notes.refetch()} />}
      {notes.data && !list.length && (
        <div className="px-4 md:px-6">
          <Empty icon={copy.icon} title={q || tag ? "Nothing matches" : copy.empty} body={q || tag ? undefined : "Start one with the button below."} />
        </div>
      )}
      <div className="grid gap-3 px-4 sm:grid-cols-2 md:px-6 xl:grid-cols-3">
        {list.map((n) => (
          <div
            key={n.id}
            className={cx(
              "group relative flex flex-col gap-2 rounded-md p-4",
              n.pinned ? "bg-secondary-container text-on-secondary-container" : "bg-surface-container-low text-on-surface",
            )}
          >
            <button
              type="button"
              className="absolute inset-0 rounded-md"
              aria-label={`Open ${n.title || "note"}`}
              onClick={() => navigate({ to: `${copy.base}/$noteId`, params: { noteId: n.id } })}
            />
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-title-medium">
                  {kind === "journal" && n.mood && <Icon name={MOODS[n.mood - 1]!} size={18} />}
                  {n.visibility === "private" && <Icon name="lock" size={16} />}
                  <span className="truncate">{n.title || "Untitled"}</span>
                </div>
                <div className="text-body-small opacity-75">
                  {memberName(n.authorId)} · {fmtDateTime(kind === "journal" ? n.createdAt : n.updatedAt)}
                </div>
              </div>
              {kind === "note" && (
                <div className="relative">
                  <IconButton icon="push_pin" filled={n.pinned} label={n.pinned ? "Unpin" : "Pin"} onClick={() => togglePin(n)} />
                </div>
              )}
            </div>
            {n.bodyMd && <p className="line-clamp-4 text-body-medium opacity-85">{excerpt(n.bodyMd, 280)}</p>}
            {n.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {n.tags.map((t) => (
                  <span key={t} className="text-label-medium opacity-80">
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <Fab icon="edit" label={copy.fab} onClick={() => navigate({ to: `${copy.base}/$noteId`, params: { noteId: "new" } })} />
    </>
  );
}
