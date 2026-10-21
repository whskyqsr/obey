import { type ReactNode, createContext, useCallback, useContext, useState } from "react";
import { useAddComment } from "../api/hooks";
import { errorMessage } from "../api/client";
import { Button, Dialog, TextArea, useSnackbar } from "./ui";

/** What a note is about: the occurrence it's kept with, who it's for, and the decision ("excusing “Lines”"). */
export interface NoteTarget {
  relId: string;
  occurrenceId: string;
  to: string;
  about: string;
}

const NoteContext = createContext<(target: NoteTarget) => void>(() => {});

/** The "Note to …" dialog, kept above the pages so it outlives the row whose decision it follows. */
export function DecisionNoteProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<NoteTarget | null>(null);
  return (
    <NoteContext.Provider value={setTarget}>
      {children}
      {target && <NoteDialog key={`${target.occurrenceId}-${target.about}`} target={target} onClose={() => setTarget(null)} />}
    </NoteContext.Provider>
  );
}

function NoteDialog({ target, onClose }: { target: NoteTarget; onClose(): void }) {
  const snack = useSnackbar();
  const add = useAddComment(target.relId);
  const [body, setBody] = useState("");
  const send = () =>
    add.mutate(
      { occurrenceId: target.occurrenceId, body: body.trim() },
      {
        onSuccess: () => {
          onClose();
          snack(`Note sent to ${target.to}`);
        },
        onError: (e) => snack(errorMessage(e)),
      },
    );
  return (
    <Dialog
      open
      onClose={onClose}
      sheetOnMobile={false}
      title={`Note to ${target.to}`}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={add.isPending} disabled={!body.trim()} onClick={send}>
            Send
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-body-medium text-on-surface-variant">About {target.about}. {target.to} is sent a notification.</p>
        <TextArea label="Note" value={body} maxLength={1000} onChange={(e) => setBody(e.target.value)} />
      </div>
    </Dialog>
  );
}

/** A one-tap decision's snackbar, offering "Add a note" for a few seconds. */
export function useNoteAfter() {
  const snack = useSnackbar();
  const open = useContext(NoteContext);
  return useCallback((text: string, target: NoteTarget) => snack(text, { label: "Add a note", onClick: () => open(target) }), [snack, open]);
}
