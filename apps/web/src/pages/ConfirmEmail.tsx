import { useEffect, useState } from "react";
import { authErrorMessage, confirmEmail, getSession, needsVerification, resendVerification } from "../auth/session";
import { errorMessage } from "../api/client";
import { FirstRunPage, FirstRunTitle } from "../components/FirstRun";
import { Button, Icon, Loading } from "../components/ui";

type State = { kind: "working" } | { kind: "done" } | { kind: "failed"; message: string };

/** Where the button in our verification email lands: confirms the address, then sends the person into the app. */
export function ConfirmEmailPage() {
  const [state, setState] = useState<State>({ kind: "working" });
  const [resent, setResent] = useState<string | null>(null);

  useEffect(() => {
    const code = new URLSearchParams(location.search).get("oobCode");
    if (!code) return setState({ kind: "failed", message: "This link is missing its code. Open it straight from the email." });
    confirmEmail(code).then(
      () => setState({ kind: "done" }),
      (e) => setState({ kind: "failed", message: authErrorMessage(e) ?? errorMessage(e) }),
    );
  }, []);

  const session = getSession();
  const canResend = state.kind === "failed" && session && needsVerification(session);

  if (state.kind === "working")
    return (
      <FirstRunPage>
        <div className="flex flex-col items-center gap-4 py-8">
          <Loading />
          <p className="text-body-large text-on-surface-variant">Confirming your email…</p>
        </div>
      </FirstRunPage>
    );
  return (
    <FirstRunPage
      actions={
        <>
          {resent && <p className="text-body-medium text-on-surface-variant">{resent}</p>}
          <Button onClick={() => location.replace("/")} className="h-12 w-full">
            Open Fealty
          </Button>
          {canResend && (
            <Button
              variant="outlined"
              onClick={() =>
                resendVerification().then(
                  () => setResent("Sent a new link. Check your inbox."),
                  (e) => setResent(authErrorMessage(e) ?? errorMessage(e)),
                )
              }
              className="h-12 w-full"
            >
              Send a new link
            </Button>
          )}
        </>
      }
    >
      <div className="pt-16">
        <Icon
          name={state.kind === "done" ? "mark_email_read" : "link_off"}
          size={40}
          className={state.kind === "done" ? "mb-6 text-primary" : "mb-6 text-error"}
        />
        <FirstRunTitle sub={state.kind === "done" ? "If you started on your phone, you can go back to the app now." : state.message}>
          {state.kind === "done" ? "Email confirmed." : "That link didn't work."}
        </FirstRunTitle>
      </div>
    </FirstRunPage>
  );
}
