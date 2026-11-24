import { useEffect, useState } from "react";
import { authErrorMessage, refreshVerification, resendVerification, signOut } from "../auth/session";
import { errorMessage } from "../api/client";
import { FirstRunPage, FirstRunTitle } from "../components/FirstRun";
import { Button, Icon } from "../components/ui";

/** Shown to email-and-password accounts until they click the link Firebase emailed them. */
export function VerifyEmailPage({ email, onVerified }: { email: string | null; onVerified?: () => void }) {
  const [busy, setBusy] = useState<"check" | "resend" | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function check(quiet = false) {
    if (!quiet) setBusy("check");
    try {
      const ok = await refreshVerification();
      if (ok) onVerified?.();
      else if (!quiet) setNote("Not verified yet. Open the link in the email, then try again.");
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
    <FirstRunPage
      actions={
        <>
          {note && <p className="text-body-medium text-on-surface-variant">{note}</p>}
          <Button busy={busy === "check"} disabled={busy !== null} onClick={() => void check()} className="h-12 w-full">
            I've verified
          </Button>
          <div className="flex items-center justify-between">
            <button type="button" disabled={busy !== null} onClick={() => void resend()} className="py-2 text-body-large text-primary disabled:opacity-40">
              Resend email
            </button>
            <button type="button" onClick={() => void signOut()} className="py-2 text-body-large text-on-surface-variant">
              Use a different account
            </button>
          </div>
        </>
      }
    >
      <div className="pt-16">
        <Icon name="drafts" size={40} className="mb-6 text-primary" />
        <FirstRunTitle
          sub={
            <>
              We sent a link to <span className="text-on-surface">{email ?? "your address"}</span>. Open it on any device, then come back here.
            </>
          }
        >
          Check your email.
        </FirstRunTitle>
      </div>
    </FirstRunPage>
  );
}
