import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { Features } from "@obey/contracts";

export type Call = (method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", url: string, payload?: unknown) => Promise<{ status: number; body: unknown }>;
type Logged = <A extends { relationshipId?: string }>(tool: string, run: (args: A) => Promise<CallToolResult>) => (args: A) => Promise<CallToolResult>;

/** Every app route a user tool reaches, by method and route pattern. app.ts refuses any other route for an AI call. */
export const USER_ROUTES = [
  "GET /me",
  "GET /relationships/:id/occurrences",
  "GET /relationships/:id/tasks",
  "GET /relationships/:id/reschedules",
  "GET /relationships/:id/curfew",
  "GET /relationships/:id/events",
  "GET /relationships/:id/rules",
  "GET /relationships/:id/protocols",
  "GET /relationships/:id/rewards",
  "GET /relationships/:id/consequences",
  "GET /relationships/:id/rule-log",
  "GET /relationships/:id/agreement",
  "GET /relationships/:id/limit-list",
  "GET /relationships/:id/notes",
  "GET /relationships/:id/balances",
  "GET /relationships/:id/stats",
  "GET /relationships/:id/moods",
  "GET /relationships/:id/months",
  "GET /relationships/:id/months/:month",
];

export const text = (value: unknown): CallToolResult => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });
export const failed = (message: string): CallToolResult => ({ content: [{ type: "text", text: message }], isError: true });

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date like 2026-11-24");
const relationshipId = z.string().uuid().describe("The dynamic's id, from list_dynamics.");
const MAX_DAYS = 31;

/** Fields that point at places; locations stay in the app. */
const LOCATION_KEYS = new Set(["placeId", "stayMinutes", "stayUntil", "place", "lat", "lng"]);
const withoutLocation = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(withoutLocation);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([k]) => !LOCATION_KEYS.has(k)).map(([k, v]) => [k, withoutLocation(v)]));
  return value;
};

interface MeBody {
  relationships: { id: string; features: Features }[];
}

export function registerUserTools(server: McpServer, call: Call, logged: Logged) {
  /** The app's answer as the tool result, or its refusal as the tool's error. */
  const fetch = async (url: string) => {
    const res = await call("GET", url);
    if (res.status >= 400) return { error: failed((res.body as { error?: string } | undefined)?.error ?? `Fealty said no (${res.status}).`) };
    return { body: withoutLocation(res.body) };
  };

  /**
   * Some parts of the app are hidden by a feature switch in the apps rather than refused by their routes. A tool for
   * one of those checks the switch itself, so it never shows what the app hides.
   */
  const switchedOn = async (rel: string, feature: keyof Features) => {
    const me = await call("GET", "/me");
    const r = (me.body as MeBody).relationships.find((x) => x.id === rel);
    return r ? r.features[feature] : false;
  };
  const off = (what: string) => failed(`${what} switched off for this dynamic.`);

  const range = (from: string, to: string) => {
    const span = (Date.parse(to) - Date.parse(from)) / 86_400_000;
    return span < 0 || span > MAX_DAYS ? `Pick a range of ${MAX_DAYS} days or less, with from before to.` : null;
  };

  const read = { readOnlyHint: true, openWorldHint: false };

  server.registerTool(
    "get_tasks_due",
    {
      title: "Tasks due",
      description: "Tasks due between two dates (up to 31 days), with their status: pending, submitted (waiting for review), completed, missed, excused or cancelled.",
      inputSchema: { relationshipId, from: day, to: day },
      annotations: read,
    },
    logged("get_tasks_due", async ({ relationshipId: rel, from, to }: { relationshipId: string; from: string; to: string }) => {
      const bad = range(from, to);
      if (bad) return failed(bad);
      const r = await fetch(`/relationships/${rel}/occurrences?from=${from}&to=${to}`);
      return r.error ?? text(r.body);
    }),
  );

  server.registerTool(
    "list_tasks",
    { title: "Tasks", description: "Every task in the dynamic with its schedule, who it's for, points and options.", inputSchema: { relationshipId }, annotations: read },
    logged("list_tasks", async ({ relationshipId: rel }: { relationshipId: string }) => {
      const r = await fetch(`/relationships/${rel}/tasks`);
      return r.error ?? text(r.body);
    }),
  );

  server.registerTool(
    "get_pending",
    {
      title: "Waiting on someone",
      description: "Open requests for more time, curfew requests, and tasks sent in and waiting for review in the last two weeks.",
      inputSchema: { relationshipId, today: day.describe("Today's date where the person is.") },
      annotations: read,
    },
    logged("get_pending", async ({ relationshipId: rel, today }: { relationshipId: string; today: string }) => {
      const requests = await fetch(`/relationships/${rel}/reschedules?status=requested`);
      if (requests.error) return requests.error;
      const from = new Date(Date.parse(today) - 14 * 86_400_000).toISOString().slice(0, 10);
      const due = await fetch(`/relationships/${rel}/occurrences?from=${from}&to=${today}`);
      if (due.error) return due.error;
      const curfew = await fetch(`/relationships/${rel}/curfew`);
      return text({
        moreTimeRequests: requests.body,
        curfewRequests: curfew.error ? [] : ((curfew.body as { requests?: unknown[] }).requests ?? []),
        waitingForReview: (due.body as { status: string }[]).filter((o) => o.status === "submitted"),
      });
    }),
  );

  server.registerTool(
    "get_calendar",
    { title: "Calendar", description: "Plans on the shared calendar between two dates (up to 31 days), with any tasks they clash with.", inputSchema: { relationshipId, from: day, to: day }, annotations: read },
    logged("get_calendar", async ({ relationshipId: rel, from, to }: { relationshipId: string; from: string; to: string }) => {
      const bad = range(from, to);
      if (bad) return failed(bad);
      const r = await fetch(`/relationships/${rel}/events?from=${from}&to=${to}`);
      return r.error ?? text(r.body);
    }),
  );

  const library = (tool: string, path: string, feature: keyof Features | null, title: string, description: string, offWords: string) =>
    server.registerTool(
      tool,
      { title, description, inputSchema: { relationshipId }, annotations: read },
      logged(tool, async ({ relationshipId: rel }: { relationshipId: string }) => {
        const r = await fetch(`/relationships/${rel}/${path}`);
        if (r.error) return r.error;
        if (feature && !(await switchedOn(rel, feature))) return off(offWords);
        return text(r.body);
      }),
    );
  library("list_rules", "rules", "rules", "Rules", "The dynamic's rules, in order.", "Rules are");
  library("list_protocols", "protocols", "protocols", "Protocols", "The dynamic's protocols (the when and how of rules), in order.", "Protocols are");
  library("list_rewards", "rewards", "points", "Rewards", "Rewards and what they cost in points.", "Points are");
  library("list_consequences", "consequences", "consequences", "Consequences", "Consequences, by severity.", "Consequences are");
  library("get_rule_log", "rule-log", "rules", "Broken rules", "Rules and protocols logged as broken, and any consequence attached.", "Rules are");
  library("get_balances", "balances", "points", "Points", "Each person's points balance.", "Points are");
  library("get_agreement", "agreement", null, "Agreement", "The agreement in force, and any version waiting to be agreed.", "");
  library("get_limits", "limit-list", null, "Limits", "The limits list. Each person's answers stay hidden until both have finished, as in the app.", "");

  server.registerTool(
    "list_notes",
    {
      title: "Notes and journal",
      description: "Notes or journal entries you can see in the app: shared ones and your own private ones.",
      inputSchema: { relationshipId, kind: z.enum(["note", "journal"]).default("note") },
      annotations: read,
    },
    logged("list_notes", async ({ relationshipId: rel, kind }: { relationshipId: string; kind: "note" | "journal" }) => {
      const r = await fetch(`/relationships/${rel}/notes`);
      if (r.error) return r.error;
      if (kind === "journal" && !(await switchedOn(rel, "journal"))) return off("The journal is");
      return text((r.body as { kind: string }[]).filter((n) => n.kind === kind));
    }),
  );

  server.registerTool(
    "get_stats",
    {
      title: "Stats",
      description: "How someone's tasks went over the last 7, 30, 90 or 365 days: done, missed, streaks and by task. Defaults to the submissive.",
      inputSchema: { relationshipId, days: z.union([z.literal(7), z.literal(30), z.literal(90), z.literal(365)]).default(30), userId: z.string().uuid().optional(), zone: z.string().default("UTC").describe("IANA time zone, e.g. America/Detroit.") },
      annotations: read,
    },
    logged("get_stats", async ({ relationshipId: rel, days, userId, zone }: { relationshipId: string; days: number; userId?: string; zone: string }) => {
      const q = new URLSearchParams({ days: String(days), zone, ...(userId ? { userId } : {}) });
      const r = await fetch(`/relationships/${rel}/stats?${q}`);
      return r.error ?? text(r.body);
    }),
  );

  server.registerTool(
    "get_moods",
    { title: "Moods", description: "Mood check-ins (1 to 5, with any words) from the last N days.", inputSchema: { relationshipId, days: z.number().int().min(1).max(366).default(30) }, annotations: read },
    logged("get_moods", async ({ relationshipId: rel, days }: { relationshipId: string; days: number }) => {
      const r = await fetch(`/relationships/${rel}/moods?days=${days}`);
      return r.error ?? text(r.body);
    }),
  );

  server.registerTool(
    "get_month",
    {
      title: "Monthly review",
      description: "One month's focus and review answers (answers stay hidden until everyone has answered), or past months when month is left out.",
      inputSchema: { relationshipId, month: z.string().regex(/^\d{4}-\d{2}$/).optional(), zone: z.string().default("UTC") },
      annotations: read,
    },
    logged("get_month", async ({ relationshipId: rel, month, zone }: { relationshipId: string; month?: string; zone: string }) => {
      const r = await fetch(month ? `/relationships/${rel}/months/${month}?zone=${encodeURIComponent(zone)}` : `/relationships/${rel}/months?zone=${encodeURIComponent(zone)}`);
      return r.error ?? text(r.body);
    }),
  );
}
