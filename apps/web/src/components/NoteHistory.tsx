import { useNoteRevisions } from "../api/hooks";
import type { Note } from "../api/types";
import { fmtDateTime } from "../lib/dates";
import { useRel } from "../lib/relationship";
import { MarkdownEditor } from "./MarkdownEditor";
import { Button, Dialog, ErrorBox, Loading } from "./ui";

/** A note's earlier versions, newest first, each with who replaced it and when. */
export function NoteHistory({ note, open, onClose }: { note: Note; open: boolean; onClose(): void }) {
  const { me, memberName } = useRel();
  const revisions = useNoteRevisions(note.id, note.revisionCount, open);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      icon="history"
      title="Edit history"
      actions={
        <Button variant="text" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
        <p className="text-body-medium text-on-surface-variant">Earlier versions, newest first. The current one is on the page.</p>
        {revisions.isLoading && <Loading />}
        {revisions.error && <ErrorBox error={revisions.error} onRetry={() => revisions.refetch()} />}
        {revisions.data?.map((r) => (
          <section key={r.id} className="flex flex-col gap-1 rounded-md bg-surface-container px-4 py-3">
            <div className="text-label-medium text-on-surface-variant">
              Replaced {fmtDateTime(r.createdAt)} by {r.editorId === me.user.id ? "you" : memberName(r.editorId)}
            </div>
            {r.title && <h3 className="text-title-medium text-on-surface">{r.title}</h3>}
            <MarkdownEditor value={r.bodyMd} onChange={() => {}} editable={false} bare />
          </section>
        ))}
      </div>
    </Dialog>
  );
}
