import { useCallback, useState, type ReactNode } from "react";
import { Button, Dialog } from "../components/ui";

/** `confirm(title, onYes)` plus the dialog element to render. */
export function useConfirm(): [(title: string, onYes: () => void, body?: ReactNode) => void, ReactNode] {
  const [state, setState] = useState<{ title: string; body?: ReactNode; onYes(): void } | null>(null);
  const confirm = useCallback((title: string, onYes: () => void, body?: ReactNode) => setState({ title, onYes, body }), []);
  const el = (
    <Dialog
      open={!!state}
      onClose={() => setState(null)}
      title={state?.title}
      sheetOnMobile={false}
      actions={
        <>
          <Button variant="text" onClick={() => setState(null)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              state?.onYes();
              setState(null);
            }}
          >
            Confirm
          </Button>
        </>
      }
    >
      {state?.body}
    </Dialog>
  );
  return [confirm, el];
}
