import { useNavigate } from "@tanstack/react-router";
import { useAiAccess, useDisconnectAiApp, useSetAiAccess } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { AiAccess, Relationship } from "../api/types";
import { Icon, SubHeader, Switch, cx, useSnackbar } from "../components/ui";
import { API_URL } from "../env";
import { ago, fmtDate, fmtTime, localDateOf, today } from "../lib/dates";
import { useRel } from "../lib/relationship";
import { useBack } from "../lib/useBack";
import { Group, Label, Row, useDynamicTitle } from "./Dynamic";

export const MCP_URL = `${API_URL}/mcp`;

/** What a call did, in the words of the history list: "added a plan". */
const DID: Record<string, string> = {
  list_dynamics: "looked up your dynamics",
  get_tasks_due: "read tasks due",
  list_tasks: "read the tasks",
  get_pending: "read what's waiting",
  get_calendar: "read the calendar",
  list_rules: "read the rules",
  list_protocols: "read the protocols",
  list_rewards: "read the rewards",
  list_consequences: "read the consequences",
  get_rule_log: "read broken rules",
  get_balances: "read points",
  get_agreement: "read the agreement",
  get_limits: "read limits",
  list_notes: "read notes",
  get_stats: "read stats",
  get_moods: "read moods",
  get_month: "read the monthly review",
  request_more_time: "asked for more time",
  request_more_time_today: "asked for more time",
  decide_request: "answered a request",
  review_task: "reviewed a task",
  add_plan: "added a plan",
  edit_plan: "changed a plan",
  delete_plan: "deleted a plan",
  add_note: "wrote a note",
  edit_note: "changed a note",
  delete_note: "deleted a note",
  create_task: "added a task",
  edit_task: "changed a task",
  delete_task: "deleted a task",
  add_rule: "added a rule",
  edit_rule: "changed a rule",
  delete_rule: "deleted a rule",
  add_protocol: "added a protocol",
  edit_protocol: "changed a protocol",
  delete_protocol: "deleted a protocol",
  log_broken_rule: "logged a broken rule",
};
export const didWords = (tool: string) => DID[tool] ?? tool.replaceAll("_", " ");

/** An AI app's mark. Every app gets the plain sparkle for now; real marks for known apps come from their brand kits. */
export function AppMark({ size = 40, className }: { kind?: AiAccess["apps"][number]["kind"]; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx("inline-flex shrink-0 items-center justify-center rounded-[22%] bg-surface-container-high text-on-surface", className)}
      style={{ width: size, height: size }}
    >
      <Icon name="auto_awesome" size={Math.round(size * 0.55)} />
    </span>
  );
}

/** "Waiting on Kitten", "On", "Off": the AI access row's state on Your dynamic. */
export function aiAccessState(rel: Relationship, myId: string): string {
  const me = rel.members.find((m) => m.userId === myId);
  if (!me?.aiAccess) return "Off";
  const waiting = rel.members.filter((m) => !m.aiAccess);
  return waiting.length === 0 ? "On" : `Waiting on ${waiting.map((m) => m.displayName).join(", ")}`;
}

const when = (iso: string) => (localDateOf(new Date(iso)) === today() ? fmtTime(iso) : fmtDate(localDateOf(new Date(iso))));

export function AiAccessPage() {
  const { rel, me, memberName } = useRel();
  const navigate = useNavigate();
  const snack = useSnackbar();
  const back = useBack(() => navigate({ to: "/dynamic" }));
  const title = useDynamicTitle();
  const q = useAiAccess(rel.id);
  const set = useSetAiAccess(rel.id);
  const disconnect = useDisconnectAiApp(rel.id);
  const data = q.data;
  const mine = data?.members.find((m) => m.userId === me.user.id)?.allowed ?? rel.members.find((m) => m.userId === me.user.id)?.aiAccess ?? false;
  const others = rel.members.filter((m) => m.userId !== me.user.id);
  const ended = rel.endedAt !== null;
  const allowedBy = (id: string) => data?.members.find((m) => m.userId === id)?.allowed ?? false;
  const who = (id: string) => (id === me.user.id ? me.user.displayName : memberName(id));
  const calls = (data?.calls ?? []).filter((c) => c.ok);

  return (
    <div className="flex flex-col pb-10">
      <SubHeader title="AI access" back="Your dynamic" onBack={back} />
      <div className="mx-auto w-full max-w-2xl px-4 md:px-6">
        <Group>
          <div className="py-1.5">
            <Switch
              label="Allow for me"
              checked={mine}
              onChange={(v) => {
                if (v && ended) return;
                set.mutate(v, { onError: (e) => snack(errorMessage(e)) });
              }}
            />
          </div>
          {others.map((m) => (
            <Row
              key={m.userId}
              headline={m.displayName}
              trailing={<span className="shrink-0 text-body-medium text-on-surface-variant">{allowedBy(m.userId) ? "Allowed" : "Not yet"}</span>}
            />
          ))}
        </Group>
        {data && !data.reachable && (
          <p className="pt-4 text-body-medium text-on-surface-variant">
            AI apps reach {title} only once {others.length > 1 ? "all" : others.length === 1 ? "both" : "you"} of you allow it, and only what each of you can see here.
          </p>
        )}

        {data && data.apps.length > 0 && (
          <>
            <Label>Connected apps</Label>
            <Group>
              {data.apps.map((a) => (
                <Row
                  key={a.id}
                  leading={<AppMark kind={a.kind} />}
                  headline={a.app}
                  supporting={`${who(a.userId)} · ${a.lastUsedAt ? `used ${ago(a.lastUsedAt)}` : `connected ${ago(a.connectedAt)}`}`}
                  trailing={
                    a.userId === me.user.id && (
                      <button
                        type="button"
                        className="state-layer shrink-0 rounded-full px-2 py-1 text-label-large text-primary"
                        onClick={() => disconnect.mutate(a.id, { onSuccess: () => snack(`${a.app} disconnected`), onError: (e) => snack(errorMessage(e)) })}
                      >
                        Disconnect
                      </button>
                    )
                  }
                />
              ))}
            </Group>
          </>
        )}

        {!ended && (
          <Group>
            <Row
              headline={<span className="text-body-medium text-on-surface-variant">Address for AI apps</span>}
              supporting={<span className="text-body-large text-on-surface">{MCP_URL.replace(/^https?:\/\//, "")}</span>}
              trailing={
                <button
                  type="button"
                  className="state-layer shrink-0 rounded-full px-2 py-1 text-label-large text-primary"
                  onClick={() => void navigator.clipboard?.writeText(MCP_URL).then(() => snack("Address copied"))}
                >
                  Copy
                </button>
              }
            />
          </Group>
        )}

        {data?.reachable && calls.length > 0 && (
          <>
            <Label>Last 30 days</Label>
            <Group>
              {calls.map((c, i) => (
                <div key={i} className="flex items-center gap-3 py-3">
                  <AppMark kind={c.kind} size={22} />
                  <span className="min-w-0 flex-1 text-body-large text-on-surface">
                    {who(c.userId)} {didWords(c.tool)}
                  </span>
                  <span className="shrink-0 text-body-medium text-on-surface-variant">{when(c.at)}</span>
                </div>
              ))}
            </Group>
          </>
        )}

      </div>
    </div>
  );
}
