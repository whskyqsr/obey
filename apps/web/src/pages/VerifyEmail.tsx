import { useEffect, useState } from "react";
import { authErrorMessage, refreshVerification, resendVerification, signOut } from "../auth/session";
import { errorMessage } from "../api/client";
import { Button, Icon } from "../components/ui";

/** Shown to email-and-password accounts until they click the link Firebase emailed them. */
export function VerifyEmailPage({ email }: { email: string | null }) {
  const [busy, setBusy] = useState<"check" | "resend" | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function check(quiet = false) {
    if (!quiet) setBusy("check");
    try {
      const ok = await refreshVerification();
      if (!ok && !quiet) setNote("Not verified yet. Open the link in the email, then try again.");
    } catch (e) {
      if (!quiet) setNote(authErrorMessage(e) ?? errorMessage(e));
    } finally {
      if (!quiet) setBusy(null);
    }
  }

  // Coming back from the email tab is the usual moment the link was clicked.
  useEffect(() => {
    const onFocus = () => void check(true);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  async function resend() {
    setBusy("resend");
    try {
      await resendVerification();
      setNote("Sent another link. Check your spam folder too.");
    } catch (e) {
      setNote(authErrorMessage(e) ?? errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-container-low p-4">
      <div className="w-full max-w-md rounded-xl bg-surface p-8 shadow-elev-1">
        <div className="mb-6 flex size-16 items-center justify-center rounded-lg bg-primary-container text-on-primary-container">
          <Icon name="mark_email_unread" filled size={32} />
        </div>
        <h1 className="text-headline-medium text-on-surface">Check your email</h1>
        <p className="mt-2 text-body-large text-on-surface-variant">
          We sent a link to <span className="text-on-surface">{email ?? "your address"}</span>. Open it to confirm the address is yours, then come back here.
        </p>
        {note && <p className="mt-4 rounded-md bg-surface-container px-3 py-2 text-body-medium text-on-surface-variant">{note}</p>}
        <div className="mt-8 flex flex-col gap-3">
          <Button icon="check" busy={busy === "check"} disabled={busy !== null} onClick={() => void check()} className="w-full">
            I've verified
          </Button>
          <Button variant="outlined" icon="send" busy={busy === "resend"} disabled={busy !== null} onClick={() => void resend()} className="w-full">
            Resend email
          </Button>
          <Button variant="text" onClick={() => void signOut()} className="w-full">
            Use a different account
          </Button>
        </div>
      </div>
    </div>
  );
}
