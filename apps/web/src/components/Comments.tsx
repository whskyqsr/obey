import { useState } from "react";
import type { Occurrence } from "../api/types";
import { useAddComment, useComments, useDeleteComment, useReviewOccurrence } from "../api/hooks";
import { errorMessage } from "../api/client";
import { fmtRelative } from "../lib/dates";
import { useReadOnly, useRel } from "../lib/relationship";
import { Avatar } from "./Avatar";
import { Button, Dialog, IconButton, TextArea, useSnackbar } from "./ui";

/**
 * The conversation on one due date ("why was this late"), so it stays with the task instead of another app.
 * Shown when there are comments or the person opens it with "Comment".
 */
export function Comments({ o, open, onOpen }: { o: Occurrence; open: boolean; onOpen(): void }) {
  const { rel, me, memberName } = useRel();
  const readOnly = useReadOnly();
  const snack = useSnackbar();
  const comments = useComments(o.id, o.commentCount > 0 || open);
  const add = useAddComment(rel.id);
  const del = useDeleteComment(rel.id);
  const [text, setText] = useState("");
  const list = comments.data ?? [];
  if (!list.length && !open) return null;

  const send = () =>
    add.mutate(
      { occurrenceId: o.id, body: text.trim() },
      {
        onSuccess: () => setText(""),
        onError: (e) => snack(errorMessage(e)),
      },
    );

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
              <IconButton
                icon="delete"
                label="Delete comment"
                className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
                onClick={() => del.mutate(c, { onError: (e) => snack(errorMessage(e)) })}
              />
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
            <IconButton icon="send" label="Send comment" variant="filled" disabled={!text.trim() || add.isPending} onClick={send} />
          </div>
        ) : (
          <Button variant="text" icon="add_comment" className="self-start" onClick={onOpen}>
            Reply
          </Button>
        ))}
    </div>
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
