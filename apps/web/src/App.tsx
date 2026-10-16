import { useEffect } from "react";
import { RouterProvider } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useMe } from "./api/hooks";
import { ApiError } from "./api/client";
import { signOut } from "./auth/session";
import { useSession } from "./auth/useSession";
import { Button, ErrorBox, Loading } from "./components/ui";
import { RelationshipProvider } from "./lib/relationship";
import { Onboarding } from "./pages/Onboarding";
import { SignInPage } from "./pages/SignIn";
import { registerPush } from "./push";
import { router } from "./router";

export function App() {
  const session = useSession();
  const qc = useQueryClient();
  useEffect(() => {
    if (session === null) qc.clear();
  }, [session, qc]);

  if (session === undefined) return <Splash />;
  if (session === null) return <SignInPage />;
  return <SignedIn key={session.uid} />;
}

function SignedIn() {
  const me = useMe();

  useEffect(() => {
    // Refresh the push token silently when permission was granted earlier.
    if (me.data) registerPush().catch(() => {});
  }, [me.data?.user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (me.isLoading) return <Splash />;
  if (me.error || !me.data)
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-4">
        <ErrorBox error={me.error ?? "No profile"} onRetry={() => me.refetch()} />
        {me.error instanceof ApiError && (me.error.status === 401 || me.error.status === 403) && (
          <Button variant="outlined" onClick={() => signOut()}>
            Sign out
          </Button>
        )}
      </div>
    );
  if (!me.data.relationships.length) return <Onboarding />;
  return (
    <RelationshipProvider me={me.data}>
      <RouterProvider router={router} />
    </RelationshipProvider>
  );
}

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Loading />
    </div>
  );
}
