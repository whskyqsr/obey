import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "../api/client";
import { signOut } from "../auth/session";
import { useRel } from "../lib/relationship";
import { Button, Dialog, TextField, useSnackbar } from "./ui";

/** Deletes the account for good, after typing "delete", then signs out. */
export function DeleteAccount() {
  const { me } = useRel();
  const qc = useQueryClient();
  const snack = useSnackbar();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  // Everyone sharing a dynamic that hasn't ended: it ends for them too.
  const partners = [...new Set(me.relationships.filter((r) => !r.endedAt).flatMap((r) => r.members.filter((m) => m.userId !== me.user.id).map((m) => m.displayName)))];

  async function remove() {
    setBusy(true);
    try {
      await api("/me", { method: "DELETE" });
      await signOut();
      qc.clear();
    } catch (e) {
      snack(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="text" icon="delete_forever" className="mt-2 text-error" onClick={() => setOpen(true)}>
        Delete account
      </Button>
      <Dialog
        open={open}
        onClose={() => !busy && setOpen(false)}
        icon="delete_forever"
        title="Delete your account?"
        actions={
          <>
            <Button variant="text" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" busy={busy} disabled={typed.trim().toLowerCase() !== "delete"} onClick={() => void remove()}>
              Delete for good
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-body-medium">
          {partners.length > 0 && (
            <p>Your dynamic with {partners.join(" and ")} ends for both of you. They keep a read-only copy of the tasks and notes you shared, shown as from a deleted account.</p>
          )}
          <p>Your profile, photo, private notes, journal and proof photos are deleted, and so is your sign-in. This can't be undone.</p>
          <TextField label='Type "delete" to confirm' value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </div>
      </Dialog>
    </>
  );
}
