import { useEffect, useState } from "react";
import { useDevices, useTestPush } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { DeviceStatus } from "../api/types";
import { fmtRelative } from "../lib/dates";
import { lastReceived, myTokenTail } from "../push";
import { Button, Icon, useSnackbar } from "./ui";

/** What a failed send means, in words; FCM's codes otherwise. */
function errorText(code: string) {
  if (code.includes("invalid-registration-token") || code.includes("invalid-argument")) return "this device's registration is no longer valid";
  if (code.includes("third-party-auth-error")) return "the push service rejected the credentials";
  return code.replace("messaging/", "").replaceAll("-", " ");
}

function deviceLine(d: DeviceStatus) {
  const name = d.platform === "android" ? "Android phone" : "Browser";
  if (d.lastError) return `${name}: last push failed (${errorText(d.lastError)})`;
  return d.lastSentAt ? `${name}: last push sent ${fmtRelative(d.lastSentAt)}` : `${name}: nothing sent yet`;
}

/**
 * Shows whether push is getting through: this browser's registration, when a push was last sent and received here,
 * the account's other devices, and a test button. A broken setup says so instead of failing quietly.
 */
export function PushHealth() {
  const snack = useSnackbar();
  const devices = useDevices();
  const test = useTestPush();
  const [received, setReceived] = useState<Date | null>(null);
  const tail = myTokenTail();
  const list = devices.data ?? [];
  const here = list.find((d) => d.tokenTail === tail);
  const others = list.filter((d) => d !== here);

  useEffect(() => {
    void lastReceived().then(setReceived);
    // A test push lands a moment after the request returns; look again shortly after.
    if (!test.isSuccess) return;
    const t = setTimeout(() => void lastReceived().then(setReceived), 4000);
    return () => clearTimeout(t);
  }, [test.isSuccess, test.data]);

  const problem = here?.lastError ? errorText(here.lastError) : !devices.isLoading && !here ? "this browser isn't registered yet; use Re-register above" : null;

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-surface-container-low p-4">
      <div className="flex items-start gap-3">
        <Icon name={problem ? "error" : "check_circle"} className={problem ? "text-error" : "text-primary"} />
        <div className="min-w-0 flex-1 text-body-medium text-on-surface-variant">
          <div className="text-body-large text-on-surface">{problem ? "Push needs attention" : "Push is set up here"}</div>
          {problem && <div className="text-error">Problem: {problem}.</div>}
          {here && <div>Last sent here: {here.lastSentAt ? fmtRelative(here.lastSentAt) : "not yet"}</div>}
          <div>Last received here: {received ? fmtRelative(received.toISOString()) : "not yet"}</div>
          {others.map((d) => (
            <div key={d.tokenTail}>{deviceLine(d)}</div>
          ))}
        </div>
      </div>
      <Button
        variant="tonal"
        icon="send"
        className="self-start"
        busy={test.isPending}
        onClick={() =>
          test.mutate(undefined, {
            onSuccess: (r) => snack(r.length ? "Test sent. It should arrive in a few seconds." : "No devices to send to yet"),
            onError: (e) => snack(errorMessage(e)),
          })
        }
      >
        Send me a test
      </Button>
    </div>
  );
}
