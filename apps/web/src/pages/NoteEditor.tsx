import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useDeleteLibraryItem, useLibrary, useSaveLibraryItem } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Note, NoteInput } from "../api/types";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { NoteComments } from "../components/Comments";
import { Button, Chip, ErrorBox, Icon, IconButton, Loading, SegmentedButtons, Switch, useSnackbar } from "../components/ui";
import { fmtDateTime } from "../lib/dates";
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
  if (!isNew && !note) return <ErrorBox error="That note doesn't exist any more." />;
  return <Editor key={noteId} note={note} kind={note?.kind ?? kind} />;
}

function Editor({ note, kind }: { note?: Note; kind: "note" | "journal" }) {
  const { rel, me, memberName, isDom } = useRel();
  const navigate = useNavigate();
  const snack = useSnackbar();
  const save = useSaveLibraryItem(rel.id, "notes");
  const del = useDeleteLibraryItem(rel.id, "notes");
  const [confirm, confirmEl] = useConfirm();
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
    save.mutate({ id: note!.id, input: { ...form, pinned: next } }, { onSuccess: () => snack(next ? "Pinned" : "Unpinned"), onError: (e) => snack(errorMessage(e)) });
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
          {isAuthor && canEdit && kind === "note" && <IconButton icon="push_pin" filled={form.pinned} label={form.pinned ? "Unpin" : "Pin"} onClick={togglePin} />}
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
        {isAuthor && kind === "note" && <IconButton icon="push_pin" filled={form.pinned} label={form.pinned ? "Unpin" : "Pin"} onClick={() => set({ pinned: !form.pinned })} />}
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
                {["sentiment_very_dissatisfied", "sentiment_dissatisfied", "sentiment_neutral", "sentiment_satisfied", "sentiment_very_satisfied"].map((icon, i) => (
                  <IconButton
                    key={icon}
                    icon={icon}
                    label={`Mood ${i + 1}`}
                    filled={form.mood === i + 1}
                    variant={form.mood === i + 1 ? "tonal" : "standard"}
                    onClick={() => set({ mood: form.mood === i + 1 ? null : i + 1 })}
                  />
                ))}
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
