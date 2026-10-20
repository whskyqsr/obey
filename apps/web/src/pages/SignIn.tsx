import { useState } from "react";
import { FIREBASE_ENABLED, API_URL } from "../env";
import { UUID_RE, authErrorMessage, createAccount, signInDev, signInWithEmail, signInWithGoogle } from "../auth/session";
import { errorMessage } from "../api/client";
import { Button, Icon, TextField } from "../components/ui";
import { pendingInvite } from "../lib/invite";

export function SignInPage() {
  const [uid, setUid] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      const friendly = authErrorMessage(e);
      const code = (e as { code?: string } | null)?.code;
      if (friendly) setError(friendly);
      else if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function dev(e: React.FormEvent) {
    e.preventDefault();
    try {
      signInDev(uid);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-container-low p-4">
      <div className="w-full max-w-md rounded-xl bg-surface p-8 shadow-elev-1">
        <div className="mb-6 flex size-16 items-center justify-center rounded-lg bg-primary-container text-on-primary-container">
          <Icon name="link" filled size={32} />
        </div>
        <h1 className="text-headline-large text-on-surface">Fealty</h1>
        <p className="mt-2 mb-8 text-body-large text-on-surface-variant">Tasks, rules and rewards for the two (or more) of you.</p>
        {pendingInvite() && (
          <div className="-mt-4 mb-6 flex items-center gap-3 rounded-md bg-secondary-container p-3 text-body-medium text-on-secondary-container">
            <Icon name="mail" />
            You've been invited. Sign in, or create an account, to accept.
          </div>
        )}

        {FIREBASE_ENABLED ? (
          <div className="flex flex-col gap-4">
            <Button icon="login" onClick={() => run(signInWithGoogle)} disabled={busy} className="w-full">
              Continue with Google
            </Button>
            <div className="flex items-center gap-3 text-body-small text-on-surface-variant">
              <div className="h-px flex-1 bg-outline-variant" />
              or
              <div className="h-px flex-1 bg-outline-variant" />
            </div>
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void run(() => signInWithEmail(email, password));
              }}
            >
              <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              <TextField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              <div className="flex flex-wrap gap-2">
                <Button variant="text" disabled={busy || !email.trim() || password.length < 6} onClick={() => run(() => createAccount(email, password))}>
                  Create account
                </Button>
                <div className="flex-1" />
                <Button type="submit" busy={busy} disabled={!email.trim() || !password}>
                  Sign in
                </Button>
              </div>
            </form>
          </div>
        ) : (
          <form onSubmit={dev} className="flex flex-col gap-4">
            <div className="rounded-md bg-tertiary-container p-3 text-body-medium text-on-tertiary-container">
              Dev sign-in: no Firebase config is set, so requests send <code>X-Dev-User</code>. Start the API at <code>{API_URL}</code> with <code>DEV_AUTH=1</code>.
            </div>
            <TextField
              label="User id (UUID)"
              value={uid}
              onChange={(e) => setUid(e.target.value)}
              placeholder="00000000-0000-4000-8000-000000000000"
              autoComplete="off"
              spellCheck={false}
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="text" onClick={() => setUid(crypto.randomUUID())}>
                Generate new
              </Button>
              <div className="flex-1" />
              <Button type="submit" disabled={!UUID_RE.test(uid.trim())}>
                Sign in
              </Button>
            </div>
          </form>
        )}
        {error && <p className="mt-4 text-body-medium text-error">{error}</p>}
      </div>
    </div>
  );
}
