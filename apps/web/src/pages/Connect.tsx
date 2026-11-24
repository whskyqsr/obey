import { useMutation, useQuery } from "@tanstack/react-query";
import { api, errorMessage } from "../api/client";
import { FirstRunPage, FirstRunTitle } from "../components/FirstRun";
import { Button, Loading } from "../components/ui";

/** The OAuth parameters an AI app sent to /oauth/authorize, passed on to this page unchanged. */
const params = () => Object.fromEntries(new URLSearchParams(location.search)) as Record<string, string>;

/** Where an AI app (Claude, over MCP) asks to connect: its name, then Allow or Not now. */
export function ConnectPage() {
  const p = params();
  const info = useQuery({
    queryKey: ["connect-info", p.client_id, p.redirect_uri, p.scope],
    queryFn: () => api<{ clientName: string; staff: boolean }>("/oauth/connect-info", { query: { client_id: p.client_id, redirect_uri: p.redirect_uri, scope: p.scope } }),
    retry: false,
  });
  const decide = useMutation({
    mutationFn: (allow: boolean) => api<{ redirect: string }>("/oauth/approve", { method: "POST", body: { ...p, allow } }),
    onSuccess: (r) => location.assign(r.redirect),
  });

  if (info.isLoading)
    return (
      <FirstRunPage>
        <Loading />
      </FirstRunPage>
    );
  if (info.error || !info.data)
    return (
      <FirstRunPage>
        <FirstRunTitle sub="Start again from the app you were connecting.">This app can't connect.</FirstRunTitle>
      </FirstRunPage>
    );
  return (
    <FirstRunPage
      center
      actions={
        <>
          {decide.error && <p className="text-body-medium text-error">{errorMessage(decide.error)}</p>}
          <Button className="h-12 w-full" busy={decide.isPending && decide.variables} onClick={() => decide.mutate(true)}>
            Allow
          </Button>
          <button type="button" disabled={decide.isPending} onClick={() => decide.mutate(false)} className="py-2 text-body-large text-on-surface">
            Not now
          </button>
        </>
      }
    >
      <div className="flex flex-col items-center pt-16">
        <h1 className="font-serif text-[40px] leading-[1.1] text-on-surface">Connect {info.data.clientName}?</h1>
        <p className="mt-3 text-body-large text-on-surface-variant">It can see and do what you can, in dynamics where everyone has allowed AI access.</p>
        {info.data.staff && <p className="mt-3 text-body-large text-on-surface-variant">It also gets the staff tools.</p>}
      </div>
    </FirstRunPage>
  );
}
