import { useState } from "react";
import { FIREBASE_ENABLED, API_URL } from "../env";
import { UUID_RE, signInDev, signInWithGoogle } from "../auth/session";
import { errorMessage } from "../api/client";
import { Button, Icon, TextField } from "../components/ui";

export function SignInPage() {
  const [uid, setUid] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function google() {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      setError(errorMessage(e));
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
        <h1 className="text-headline-large text-on-surface">Obey</h1>
        <p className="mt-2 mb-8 text-body-large text-on-surface-variant">Tasks, rules and rewards for the two (or more) of you.</p>

        {FIREBASE_ENABLED ? (
          <Button icon="login" onClick={google} busy={busy} className="w-full">
            Continue with Google
          </Button>
        ) : (
          <form onSubmit={dev} className="flex flex-col gap-4">
            <div className="rounded-md bg-tertiary-container p-3 text-body-medium text-on-tertiary-container">
              Dev sign-in: no Firebase config is set, so requests send <code>X-Dev-User</code>. Start the API at{" "}
              <code>{API_URL}</code> with <code>DEV_AUTH=1</code>.
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
