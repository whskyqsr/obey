import { useState } from "react";
import { useEditOccurrence, useTaskHistory } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { HistoryEntry } from "../api/types";
import { fmtDate, fmtDateTime } from "../lib/dates";
import { useRel } from "../lib/relationship";
import { Badge, Button, Dialog, ErrorBox, Loading, SegmentedButtons, TextArea, TextField, useSnackbar } from "./ui";

type Fixable = "completed" | "missed" | "excused";

const LABEL: Record<HistoryEntry["status"], { label: string; tone: "primary" | "error" | "tertiary" | "neutral" }> = {
  pending: { label: "To do", tone: "neutral" },
  submitted: { label: "Awaiting review", tone: "tertiary" },
  completed: { label: "Done", tone: "primary" },
  missed: { label: "Missed", tone: "error" },
  excused: { label: "Excused", tone: "neutral" },
  cancelled: { label: "Called off", tone: "neutral" },
};

/** `2026-10-16T21:30` in the browser's zone, for <input type="datetime-local">. */
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

/** Past occurrences of a task. A Dominant can tap one to correct it. */
export function TaskHistory({ taskId }: { taskId: string }) {
  const { rel, me, isDom, memberName, features } = useRel();
  const history = useTaskHistory(rel.id, taskId);
  const [editing, setEditing] = useState<HistoryEntry | null>(null);
  const entries = history.data?.pages.flat() ?? [];

  return (
    <section className="px-4 pb-10 md:px-6">
      <h2 className="mb-2 text-title-medium text-on-surface-variant">History</h2>
      {history.isLoading && <Loading />}
      {history.error && <ErrorBox error={history.error} onRetry={() => history.refetch()} />}
      {history.data && entries.length === 0 && <p className="text-body-medium text-on-surface-variant">Nothing yet. Finished and missed occurrences show up here.</p>}
      {entries.length > 0 && (
        <ul className="overflow-hidden rounded-lg bg-surface-container-low">
          {entries.map((h) => {
            const s = LABEL[h.status];
            return (
              <li key={h.id}>
                <button
                  type="button"
                  disabled={!isDom || h.status === "cancelled"}
                  onClick={() => setEditing(h)}
                  className="state-layer flex w-full items-center gap-3 px-4 py-3 text-left disabled:cursor-default"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-body-large text-on-surface">{fmtDate(h.originalDate, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</div>
                    <div className="truncate text-body-small text-on-surface-variant">
                      {h.completedAt ? `Done ${fmtDateTime(h.completedAt)}` : `Due ${fmtDateTime(h.dueAt)}`}
                      {h.editedBy && ` · edited by ${h.editedBy === me.user.id ? "you" : memberName(h.editedBy)}`}
                    </div>
                  </div>
                  {features.points && h.pointsDelta !== 0 && (
                    <span className={h.pointsDelta > 0 ? "text-label-large text-primary" : "text-label-large text-error"}>
                      {h.pointsDelta > 0 ? `+${h.pointsDelta}` : h.pointsDelta}
                    </span>
                  )}
                  <Badge tone={s.tone}>{s.label}</Badge>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {history.hasNextPage && (
        <Button variant="text" className="mt-2" busy={history.isFetchingNextPage} onClick={() => history.fetchNextPage()}>
          Show older
        </Button>
      )}
      {editing && <EditEntry entry={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function EditEntry({ entry, onClose }: { entry: HistoryEntry; onClose(): void }) {
  const { rel, features } = useRel();
  const snack = useSnackbar();
  const edit = useEditOccurrence(rel.id);
  const [status, setStatus] = useState<Fixable>(entry.status === "submitted" ? "completed" : (entry.status as Fixable));
  const [doneAt, setDoneAt] = useState(toLocalInput(entry.completedAt ?? entry.dueAt));
  const [note, setNote] = useState(entry.noteMd ?? "");

  function save() {
    edit.mutate(
      {
        id: entry.id,
        change: {
          status,
          ...(status === "completed" && doneAt ? { completedAt: new Date(doneAt).toISOString() } : {}),
          noteMd: note.trim() ? note : null,
        },
      },
      {
        onSuccess: () => {
          snack("History updated");
          onClose();
        },
        onError: (e) => snack(errorMessage(e)),
      },
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      icon="history"
      title={fmtDate(entry.originalDate, { weekday: "long", month: "long", day: "numeric" })}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={edit.isPending} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <SegmentedButtons<Fixable>
          value={status}
          onChange={setStatus}
          options={[
            { value: "completed", label: "Done" },
            { value: "missed", label: "Missed" },
            { value: "excused", label: "Excused" },
          ]}
          className="w-full"
        />
        {status === "completed" && <TextField label="Done at" type="datetime-local" value={doneAt} onChange={(e) => setDoneAt(e.target.value)} />}
        <TextArea label="Note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        {features.points && <p className="text-body-small text-on-surface-variant">Points follow the status: done earns the task's points, missed costs its penalty, excused is neither.</p>}
      </div>
    </Dialog>
  );
}
