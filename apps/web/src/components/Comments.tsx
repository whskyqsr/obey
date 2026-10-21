import { useState } from "react";
import type { Note, Occurrence } from "../api/types";
import { useAddComment, useAddNoteComment, useComments, useDeleteComment, useDeleteNoteComment, useNoteComments, useReviewOccurrence } from "../api/hooks";
import { errorMessage } from "../api/client";
import { fmtRelative } from "../lib/dates";
import { useReadOnly, useRel } from "../lib/relationship";
import { Avatar } from "./Avatar";
import { Button, Dialog, IconButton, TextArea, useSnackbar } from "./ui";

type AnyComment = { id: string; authorId: string; body: string; createdAt: string };

/** A list of comments with a box to add one; each person can delete their own. */
function CommentThread<C extends AnyComment>({
  list,
  open,
  onOpen,
  onAdd,
  onDelete,
  adding,
}: {
  list: C[];
  open: boolean;
  onOpen?(): void;
  onAdd(body: string, done: () => void): void;
  onDelete(c: C): void;
  adding: boolean;
}) {
  const { rel, me, memberName } = useRel();
  const readOnly = useReadOnly();
  const [text, setText] = useState("");
  const send = () => onAdd(text.trim(), () => setText(""));

  return (
    <div className="flex flex-col gap-2">
      {list.map((c) => {
        const author = rel.members.find((m) => m.userId === c.authorId);
        return (
          <div key={c.id} className="group flex items-start gap-2">
            <Avatar userId={c.authorId} name={author?.displayName ?? "?"} version={author?.avatarVersion ?? null} size={28} />
            <div className="min-w-0 flex-1 rounded-md bg-surface-container px-3 py-2">
              <div className="text-label-medium text-on-surface-variant">
                {c.authorId === me.user.id ? "You" : memberName(c.authorId)} · {Date.now() - Date.parse(c.createdAt) < 60_000 ? "just now" : fmtRelative(c.createdAt)}
              </div>
              <div className="text-body-medium whitespace-pre-wrap text-on-surface">{c.body}</div>
            </div>
            {c.authorId === me.user.id && !readOnly && (
              <IconButton icon="delete" label="Delete comment" className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100" onClick={() => onDelete(c)} />
            )}
          </div>
        );
      })}
      {!readOnly &&
        (open ? (
          <div className="flex items-end gap-2">
            <TextArea
              label="Add a comment"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={2000}
              rows={1}
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim()) send();
              }}
            />
            <IconButton icon="send" label="Send comment" variant="filled" disabled={!text.trim() || adding} onClick={send} />
          </div>
        ) : (
          <Button variant="text" icon="add_comment" className="self-start" onClick={onOpen}>
            Reply
          </Button>
        ))}
    </div>
  );
}

/**
 * The conversation on one due date ("why was this late"), so it stays with the task instead of another app.
 * Shown when there are comments or the person opens it with "Comment".
 */
export function Comments({ o, open, onOpen }: { o: Pick<Occurrence, "id" | "commentCount">; open: boolean; onOpen(): void }) {
  const { rel } = useRel();
  const snack = useSnackbar();
  const comments = useComments(o.id, o.commentCount > 0 || open);
  const add = useAddComment(rel.id);
  const del = useDeleteComment(rel.id);
  const list = comments.data ?? [];
  if (!list.length && !open) return null;
  return (
    <CommentThread
      list={list}
      open={open}
      onOpen={onOpen}
      adding={add.isPending}
      onAdd={(body, done) => add.mutate({ occurrenceId: o.id, body }, { onSuccess: done, onError: (e) => snack(errorMessage(e)) })}
      onDelete={(c) => del.mutate(c, { onError: (e) => snack(errorMessage(e)) })}
    />
  );
}

/** Replies under a journal entry or shared note, with the box to add one always open. */
/** Answering something on Today (a low check-in, "I'm home") in its comments, without leaving the page. */
export function ReplyDialog({ o, title, intro, onClose }: { o: Pick<Occurrence, "id" | "commentCount">; title: string; intro?: string; onClose(): void }) {
  return (
    <Dialog
      open
      onClose={onClose}
      icon="chat"
      title={title}
      actions={
        <Button variant="text" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        {intro && <p className="text-body-medium text-on-surface-variant">{intro}</p>}
        <Comments o={o} open onOpen={() => {}} />
      </div>
    </Dialog>
  );
}

export function NoteComments({ note }: { note: Note }) {
  const { rel } = useRel();
  const snack = useSnackbar();
  const comments = useNoteComments(note.id);
  const add = useAddNoteComment(rel.id);
  const del = useDeleteNoteComment(rel.id);
  const list = comments.data ?? [];
  return (
    <section className="flex flex-col gap-3" aria-label="Comments">
      <h2 className="text-title-medium text-on-surface">Comments{list.length > 0 && ` · ${list.length}`}</h2>
      <CommentThread
        list={list}
        open
        adding={add.isPending}
        onAdd={(body, done) => add.mutate({ noteId: note.id, body }, { onSuccess: done, onError: (e) => snack(errorMessage(e)) })}
        onDelete={(c) => del.mutate(c, { onError: (e) => snack(errorMessage(e)) })}
      />
    </section>
  );
}

/** Send a submitted task back, with an optional note on what to fix that lands in its comments. */
export function SendBackDialog({ o, open, onClose }: { o: Occurrence; open: boolean; onClose(): void }) {
  const { rel } = useRel();
  const snack = useSnackbar();
  const review = useReviewOccurrence(rel.id);
  const [comment, setComment] = useState("");
  return (
    <Dialog
      open={open}
      onClose={onClose}
      icon="undo"
      title="Send it back?"
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button
            busy={review.isPending}
            onClick={() =>
              review.mutate(
                { id: o.id, approve: false, comment },
                {
                  onSuccess: () => {
                    onClose();
                    setComment("");
                    snack("Sent back");
                  },
                  onError: (e) => snack(errorMessage(e)),
                },
              )
            }
          >
            Send back
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p>“{o.title}” goes back to their list to do again.</p>
        <TextArea label="What needs fixing? (optional)" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} rows={3} />
      </div>
    </Dialog>
  );
}
