import { useEffect, useState } from "react";
import { authErrorMessage, confirmEmail, getSession, needsVerification, resendVerification } from "../auth/session";
import { errorMessage } from "../api/client";
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

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-container-low p-4">
      <div className="w-full max-w-md rounded-xl bg-surface p-8 shadow-elev-1">
        {state.kind === "working" ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loading />
            <p className="text-body-large text-on-surface-variant">Confirming your email…</p>
          </div>
        ) : (
          <>
            <div
              className={
                state.kind === "done"
                  ? "mb-6 flex size-16 items-center justify-center rounded-lg bg-primary-container text-on-primary-container"
                  : "mb-6 flex size-16 items-center justify-center rounded-lg bg-error-container text-on-error-container"
              }
            >
              <Icon name={state.kind === "done" ? "mark_email_read" : "link_off"} filled size={32} />
            </div>
            <h1 className="text-headline-medium text-on-surface">{state.kind === "done" ? "Email confirmed" : "That link didn't work"}</h1>
            <p className="mt-2 text-body-large text-on-surface-variant">
              {state.kind === "done" ? "You're all set. If you started on your phone, you can go back to the app now." : state.message}
            </p>
            {resent && <p className="mt-4 rounded-md bg-surface-container px-3 py-2 text-body-medium text-on-surface-variant">{resent}</p>}
            <div className="mt-8 flex flex-col gap-3">
              <Button icon="arrow_forward" onClick={() => location.replace("/")} className="w-full">
                Open Obey
              </Button>
              {canResend && (
                <Button
                  variant="outlined"
                  icon="send"
                  onClick={() =>
                    resendVerification().then(
                      () => setResent("Sent a new link. Check your inbox."),
                      (e) => setResent(authErrorMessage(e) ?? errorMessage(e)),
                    )
                  }
                  className="w-full"
                >
                  Send a new link
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
