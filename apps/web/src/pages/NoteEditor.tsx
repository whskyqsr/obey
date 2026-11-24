import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { keys, useDeleteLibraryItem, useLibrary, useSaveLibraryItem } from "../api/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { errorMessage } from "../api/client";
import type { Note, NoteInput } from "../api/types";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { NoteComments } from "../components/Comments";
import { NoteHistory } from "../components/NoteHistory";
import { BackLink, Button, Chip, ErrorBox, Icon, IconButton, Loading, OverflowMenu, SegmentedButtons, Switch, useSnackbar } from "../components/ui";
import { fmtDateTime } from "../lib/dates";
import { dayWord } from "./Notes";
import { MOODS } from "../components/Mood";
import { useRel } from "../lib/relationship";
import { useBack } from "../lib/useBack";
import { useConfirm } from "../lib/useConfirm";

export function NoteEditorPage({ noteId, kind }: { noteId: string; kind: "note" | "journal" }) {
  const { rel } = useRel();
  const notes = useLibrary(rel.id, "notes");
  const isNew = noteId === "new";
  const note = notes.data?.find((n) => n.id === noteId);
  if (!isNew && notes.isLoading) return <Loading />;
  if (!isNew && notes.error) return <ErrorBox error={notes.error} onRetry={() => notes.refetch()} />;
  if (!isNew && !note && !adopted.has(noteId)) return <ErrorBox error="That note doesn't exist any more." />;
  const k = note?.kind ?? kind;
  // Notes are a page you write on, saved as you go; journal entries keep their read-then-edit flow.
  return k === "note" ? <NotePage key={adopted.get(noteId) ?? noteId} note={note} /> : <Editor key={noteId} note={note} kind={k} />;
}

/** A new note that got its id while being written keeps its editor (and cursor) when the address changes to that id. */
const adopted = new Map<string, string>();

const SAVE_AFTER_MS = 800;

function NotePage({ note }: { note?: Note }) {
  const { rel, me, isDom } = useRel();
  const navigate = useNavigate();
  const snack = useSnackbar();
  const save = useSaveLibraryItem(rel.id, "notes");
  const del = useDeleteLibraryItem(rel.id, "notes");
  const [confirm, confirmEl] = useConfirm();
  const [historyOpen, setHistoryOpen] = useState(false);
  const canEdit = !note || note.canEdit;
  const isAuthor = !note || note.authorId === me.user.id;
  const sub = rel.members.find((m) => m.role === "submissive");
  const back = useBack(() => navigate({ to: "/notes" }));
  const qc = useQueryClient();

  const [form, setForm] = useState<NoteInput>(() => ({
    kind: "note",
    title: note?.title ?? "",
    bodyMd: note?.bodyMd ?? "",
    visibility: note?.visibility ?? "shared",
    tags: note?.tags ?? [],
    pinned: note?.pinned ?? false,
    mood: null,
    subCanEdit: note?.subCanEdit ?? false,
  }));
  // Saving as you go: changes wait a moment after the last keystroke, then go up one save at a time.
  const id = useRef(note?.id);
  const latest = useRef(form);
  const dirty = useRef(false);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");

  const flush = async () => {
    clearTimeout(timer.current);
    if (!dirty.current || inFlight.current) return;
    const input = latest.current;
    // A new note isn't made until it has something in it.
    if (!id.current && !input.title.trim() && !input.bodyMd.trim()) return;
    dirty.current = false;
    inFlight.current = true;
    setStatus("saving");
    try {
      const saved = await save.mutateAsync({ id: id.current, input: { ...input, title: input.title.trim() } });
      if (!id.current && saved?.id) {
        id.current = saved.id;
        adopted.set(saved.id, "new");
        // The list learns of it now, so nothing shows the new note as missing while it refetches.
        qc.setQueryData<Note[]>(keys.library(rel.id, "notes"), (list) => (list && !list.some((n) => n.id === saved.id) ? [saved as Note, ...list] : list));
        void navigate({ to: "/notes/$noteId", params: { noteId: saved.id }, replace: true });
      }
      setStatus("saved");
    } catch (e) {
      dirty.current = true;
      setStatus("failed");
      snack(errorMessage(e));
    } finally {
      inFlight.current = false;
    }
    if (dirty.current) schedule();
  };
  const schedule = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_AFTER_MS);
  };
  const set = (patch: Partial<NoteInput>) => {
    const cur = latest.current;
    if ((Object.keys(patch) as (keyof NoteInput)[]).every((k) => JSON.stringify(patch[k]) === JSON.stringify(cur[k]))) return;
    const next = { ...cur, ...patch };
    latest.current = next;
    setForm(next);
    dirty.current = true;
    schedule();
  };
  // Leaving the page saves whatever is still waiting.
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => void flushRef.current(), []);
  useEffect(() => {
    const onHide = () => void flushRef.current();
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);

  const [tagging, setTagging] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  function addTag() {
    const t = tagDraft.trim().replace(/^#/, "").slice(0, 40);
    if (t && !form.tags.includes(t) && form.tags.length < 20) set({ tags: [...form.tags, t] });
    setTagDraft("");
  }

  const other = isAuthor ? (sub && sub.userId !== me.user.id ? sub : undefined) : undefined;
  const saved = status === "saving" ? "saving…" : status === "failed" ? "not saved yet" : status === "saved" ? "saved just now" : null;
  const meta = [
    form.visibility === "private" ? "Private" : "Shared",
    form.visibility === "shared" && form.subCanEdit && other ? `${other.displayName} can edit` : null,
    !isAuthor && canEdit ? "you can edit this" : null,
    !isAuthor && !canEdit ? "read only" : null,
    saved ?? (note ? `edited ${dayWord(note.updatedAt)}` : null),
  ].filter(Boolean);

  const menu = [
    ...(isAuthor && note ? [{ label: form.pinned ? "Unpin" : "Pin to the top", icon: "push_pin", onClick: () => set({ pinned: !form.pinned }) }] : []),
    ...(isAuthor
      ? [
          form.visibility === "shared"
            ? { label: "Make private", icon: "lock", onClick: () => set({ visibility: "private", subCanEdit: false }) }
            : { label: "Share", icon: "group", onClick: () => set({ visibility: "shared" }) },
        ]
      : []),
    ...(isAuthor && isDom && sub && form.visibility === "shared"
      ? [
          form.subCanEdit
            ? { label: `Stop ${sub.displayName} editing`, icon: "edit_off", onClick: () => set({ subCanEdit: false }) }
            : { label: `Let ${sub.displayName} edit`, icon: "edit", onClick: () => set({ subCanEdit: true }) },
        ]
      : []),
    ...(isAuthor && note
      ? [
          {
            label: "Delete",
            icon: "delete",
            danger: true,
            onClick: () =>
              confirm("Delete this note?", () => {
                clearTimeout(timer.current);
                dirty.current = false;
                del.mutate(note.id, {
                  onSuccess: () => {
                    snack("Note deleted");
                    // Back to the notes list, wherever the note was opened from.
                    void navigate({ to: "/notes", replace: true });
                  },
                  onError: (e) => snack(errorMessage(e)),
                });
              }),
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col pb-24 md:pb-10">
      <header className="flex min-h-10 items-center gap-1 px-2 pt-3 md:px-4 md:pt-6 lg:hidden">
        <div className="min-w-0 flex-1 pl-2">
          <BackLink label="Notes" onClick={back} />
        </div>
        {note && note.revisionCount > 0 && <IconButton icon="history" label="Edit history" onClick={() => setHistoryOpen(true)} />}
        {menu.length > 0 && <OverflowMenu items={menu} />}
      </header>
      <article className="flex flex-col px-4 pt-4 md:px-6 lg:px-16 lg:pt-10">
        <div className="flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            {form.tags.map((t) =>
              tagging ? (
                <Chip key={t} icon="close" onClick={() => set({ tags: form.tags.filter((x) => x !== t) })} className="h-10! px-4!">
                  {t}
                </Chip>
              ) : (
                <Chip key={t} className="h-10! px-4!">
                  {t}
                </Chip>
              ),
            )}
            {canEdit &&
              (tagging ? (
                <input
                  autoFocus
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addTag();
                    } else if (e.key === "Escape") setTagging(false);
                    else if (e.key === "Backspace" && !tagDraft && form.tags.length) set({ tags: form.tags.slice(0, -1) });
                  }}
                  onBlur={() => {
                    addTag();
                    setTagging(false);
                  }}
                  placeholder="New tag"
                  aria-label="New tag"
                  className="h-10 w-32 rounded-full border border-on-surface bg-transparent px-4 text-label-large text-on-surface outline-none placeholder:text-on-surface-variant/70"
                />
              ) : (
                <button
                  type="button"
                  aria-label="Add a tag"
                  title="Add a tag"
                  onClick={() => setTagging(true)}
                  className="state-layer flex h-10 w-12 items-center justify-center rounded-full border border-outline-variant text-on-surface-variant"
                >
                  <Icon name="add" size={20} />
                </button>
              ))}
          </div>
          {/* Wide screens: the list is beside the note, so the history and menu sit with it instead of a back line. */}
          <div className="hidden items-center gap-1 lg:flex">
            {note && note.revisionCount > 0 && <IconButton icon="history" label="Edit history" onClick={() => setHistoryOpen(true)} />}
            {menu.length > 0 && <OverflowMenu items={menu} />}
          </div>
        </div>
        <textarea
          value={form.title}
          onChange={(e) => set({ title: e.target.value.replace(/\n/g, " ") })}
          onKeyDown={(e) => {
            // Enter goes on to the text, as in the mockup's one-line title.
            if (e.key !== "Enter") return;
            e.preventDefault();
            (e.currentTarget.closest("article")?.querySelector(".ProseMirror") as HTMLElement | null)?.focus();
          }}
          autoFocus={!note}
          placeholder="Title"
          maxLength={200}
          rows={1}
          readOnly={!canEdit}
          aria-label="Title"
          data-field
          className="mt-4 field-sizing-content w-full resize-none bg-transparent font-serif text-[46px] leading-[1.1] tracking-[-0.01em] text-on-surface outline-none placeholder:text-on-surface-variant/50 md:text-[56px]"
        />
        <p className="mt-1 text-body-small text-on-surface-variant">{meta.join(" · ")}</p>
        <div className="mt-3 md:mt-5">
          <MarkdownEditor value={form.bodyMd} onChange={(bodyMd) => set({ bodyMd })} editable={canEdit} placeholder="Write something…" letters />
        </div>
      </article>
      {note && <NoteHistory note={note} open={historyOpen} onClose={() => setHistoryOpen(false)} />}
      {confirmEl}
    </div>
  );
}

function Editor({ note, kind }: { note?: Note; kind: "note" | "journal" }) {
  const { rel, me, memberName, isDom } = useRel();
  const navigate = useNavigate();
  const snack = useSnackbar();
  const save = useSaveLibraryItem(rel.id, "notes");
  const del = useDeleteLibraryItem(rel.id, "notes");
  const [confirm, confirmEl] = useConfirm();
  const [historyOpen, setHistoryOpen] = useState(false);
  // The server decides who may change a note: its author (unless a sub's notes are switched off), or the sub on a note opened up to them.
  const canEdit = !note || note.canEdit;
  const isAuthor = !note || note.authorId === me.user.id;
  const sub = rel.members.find((m) => m.role === "submissive");

  const [form, setForm] = useState<NoteInput>(() => ({
    kind,
    title: note?.title ?? "",
    bodyMd: note?.bodyMd ?? "",
    visibility: note?.visibility ?? "shared",
    tags: note?.tags ?? [],
    pinned: note?.pinned ?? false,
    mood: note?.mood ?? null,
    subCanEdit: note?.subCanEdit ?? false,
  }));
  const [tagDraft, setTagDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  // Existing notes open for reading; Edit switches to the editor.
  const [editing, setEditing] = useState(!note);
  const set = (patch: Partial<NoteInput>) => {
    setForm((f) => ({ ...f, ...patch }));
    setDirty(true);
  };

  const back = useBack(() => navigate({ to: kind === "journal" ? "/journal" : "/notes" }));

  function addTag() {
    const t = tagDraft.trim().replace(/^#/, "").slice(0, 40);
    if (t && !form.tags.includes(t) && form.tags.length < 20) set({ tags: [...form.tags, t] });
    setTagDraft("");
  }

  function submit() {
    save.mutate(
      { id: note?.id, input: { ...form, title: form.title.trim() } },
      {
        onSuccess: (saved) => {
          setDirty(false);
          setEditing(false);
          snack("Saved");
          if (!note && saved?.id) navigate({ to: kind === "journal" ? "/journal/$noteId" : "/notes/$noteId", params: { noteId: saved.id }, replace: true });
        },
        onError: (e) => snack(errorMessage(e)),
      },
    );
  }

  function discard() {
    setForm({
      kind,
      title: note!.title,
      bodyMd: note!.bodyMd,
      visibility: note!.visibility,
      tags: note!.tags,
      pinned: note!.pinned,
      mood: note!.mood,
      subCanEdit: note!.subCanEdit,
    });
    setDirty(false);
    setEditing(false);
  }

  function togglePin() {
    const next = !form.pinned;
    setForm((f) => ({ ...f, pinned: next }));
    save.mutate(
      { id: note!.id, input: { ...form, pinned: next } },
      { onSuccess: () => snack(next ? "Pinned" : "Unpinned"), onError: (e) => snack(errorMessage(e)) },
    );
  }

  const deleteButton = note && note.authorId === me.user.id && (
    <IconButton
      icon="delete"
      label="Delete"
      onClick={() =>
        confirm(kind === "journal" ? "Delete this entry?" : "Delete this note?", () =>
          del.mutate(note.id, {
            onSuccess: () => {
              snack(kind === "journal" ? "Entry deleted" : "Note deleted");
              back();
            },
            onError: (e) => snack(errorMessage(e)),
          }),
        )
      }
    />
  );

  if (note && !editing) {
    return (
      <div className="flex flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-1 bg-surface px-2 md:px-4">
          <IconButton icon="arrow_back" label="Back" onClick={back} />
          <div className="flex-1" />
          {isAuthor && canEdit && kind === "note" && (
            <IconButton icon="push_pin" filled={form.pinned} label={form.pinned ? "Unpin" : "Pin"} onClick={togglePin} />
          )}
          {deleteButton}
          {canEdit && (
            <Button onClick={() => setEditing(true)} icon="edit">
              Edit
            </Button>
          )}
        </header>
        <article className="flex flex-col gap-3 px-4 pb-10 md:px-6">
          <h1 className="text-headline-medium text-on-surface">{form.title || (kind === "journal" ? "Journal entry" : "Untitled")}</h1>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-medium text-on-surface-variant">
            {kind === "journal" && form.mood && <Icon name={MOODS[form.mood - 1]!} size={20} />}
            <span>
              {memberName(note.authorId)} · {fmtDateTime(kind === "journal" ? note.createdAt : note.updatedAt)}
            </span>
            {!isAuthor && canEdit && <span>· You can edit this</span>}
            {note.revisionCount > 0 && (
              <span>
                ·{" "}
                <button type="button" className="rounded-sm underline underline-offset-2 hover:text-on-surface" onClick={() => setHistoryOpen(true)}>
                  Edited
                </button>
              </span>
            )}
            {form.visibility === "private" && (
              <span className="flex items-center gap-1">
                <Icon name="lock" size={16} /> Private
              </span>
            )}
          </div>
          {form.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {form.tags.map((t) => (
                <Chip key={t}>#{t}</Chip>
              ))}
            </div>
          )}
          <MarkdownEditor value={form.bodyMd} onChange={() => {}} editable={false} bare />
          {kind === "journal" && note.visibility === "shared" && (
            <div className="mt-4 border-t border-outline-variant pt-4">
              <NoteComments note={note} />
            </div>
          )}
        </article>
        <NoteHistory note={note} open={historyOpen} onClose={() => setHistoryOpen(false)} />
        {confirmEl}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* h-14 matches the formatting toolbar's sticky offset (top-14) in MarkdownEditor. */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-1 bg-surface px-2 md:px-4">
        <IconButton
          icon={note ? "close" : "arrow_back"}
          label={note ? "Stop editing" : "Back"}
          onClick={() => {
            const leave = note ? discard : back;
            if (dirty) confirm("Discard unsaved changes?", leave);
            else leave();
          }}
        />
        <div className="flex-1" />
        {isAuthor && kind === "note" && (
          <IconButton icon="push_pin" filled={form.pinned} label={form.pinned ? "Unpin" : "Pin"} onClick={() => set({ pinned: !form.pinned })} />
        )}
        {deleteButton}
        {canEdit && (
          <Button onClick={submit} busy={save.isPending} disabled={!dirty && !!note} icon="save">
            Save
          </Button>
        )}
      </header>

      <div className="flex flex-col gap-4 px-4 pb-10 md:px-6">
        <input
          value={form.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="Title"
          maxLength={200}
          readOnly={!canEdit}
          className="w-full bg-transparent text-headline-medium text-on-surface outline-none placeholder:text-on-surface-variant/60"
        />

        {isAuthor && (
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedButtons
              value={form.visibility}
              onChange={(visibility) => set({ visibility, subCanEdit: visibility === "shared" && form.subCanEdit })}
              options={[
                { value: "shared", label: "Shared", icon: "group" },
                { value: "private", label: "Private", icon: "lock" },
              ]}
            />
            {form.kind === "journal" && (
              <div className="flex items-center gap-1" role="radiogroup" aria-label="Mood">
                {["sentiment_very_dissatisfied", "sentiment_dissatisfied", "sentiment_neutral", "sentiment_satisfied", "sentiment_very_satisfied"].map(
                  (icon, i) => (
                    <IconButton
                      key={icon}
                      icon={icon}
                      label={`Mood ${i + 1}`}
                      filled={form.mood === i + 1}
                      variant={form.mood === i + 1 ? "tonal" : "standard"}
                      onClick={() => set({ mood: form.mood === i + 1 ? null : i + 1 })}
                    />
                  ),
                )}
              </div>
            )}
          </div>
        )}
        {isAuthor && isDom && kind === "note" && form.visibility === "shared" && sub && (
          <div className="max-w-md">
            <Switch
              checked={form.subCanEdit}
              onChange={(subCanEdit) => set({ subCanEdit })}
              label={`${sub.displayName} can edit`}
              help="They can change the title, text and tags. Only you can delete it or make it private."
            />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Icon name="sell" size={20} className="text-on-surface-variant" />
          {form.tags.map((t) => (
            <Chip key={t} onClick={canEdit ? () => set({ tags: form.tags.filter((x) => x !== t) }) : undefined} icon="close">
              #{t}
            </Chip>
          ))}
          {canEdit && (
            <input
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addTag();
                } else if (e.key === "Backspace" && !tagDraft && form.tags.length) set({ tags: form.tags.slice(0, -1) });
              }}
              onBlur={addTag}
              placeholder="Add tag"
              className="h-8 w-28 rounded-sm bg-transparent px-2 text-label-large text-on-surface outline-none placeholder:text-on-surface-variant/70 focus:bg-surface-container"
            />
          )}
        </div>

        <MarkdownEditor
          value={form.bodyMd}
          onChange={(bodyMd) => set({ bodyMd })}
          editable={canEdit}
          placeholder="Write freely. Use the toolbar for headings, lists and checklists."
        />
      </div>
      {confirmEl}
    </div>
  );
}
