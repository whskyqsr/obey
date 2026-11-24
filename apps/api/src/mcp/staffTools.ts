import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { type Call, failed, text } from "./tools.js";

type Logged = <A extends object>(tool: string, run: (args: A) => Promise<CallToolResult>) => (args: A) => Promise<CallToolResult>;

/** The admin routes staff tools reach. Reported photos stay on the web queue. */
export const STAFF_ROUTES = ["GET /admin/reports", "POST /admin/reports/:id/resolve", "GET /admin/usage", "GET /admin/accounts"];

/** Tools for the Fealty team, only on a connection with the staff scope. None of them read inside a dynamic. */
export function registerStaffTools(server: McpServer, call: Call, logged: Logged, webUrl: string) {
  const answer = async (method: "GET" | "POST", url: string, payload?: unknown) => {
    const res = await call(method, url, payload);
    if (res.status >= 400) return failed((res.body as { error?: string } | undefined)?.error ?? `Fealty said no (${res.status}).`);
    return text(res.body);
  };

  server.registerTool(
    "staff_list_reports",
    {
      title: "Reports",
      description: `Reports people filed, newest first. Open ones by default. A reported photo can only be viewed on the web queue at ${webUrl}/admin/reports.`,
      inputSchema: { includeResolved: z.boolean().default(false) },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    logged("staff_list_reports", async ({ includeResolved }: { includeResolved: boolean }) => answer("GET", `/admin/reports${includeResolved ? "?all=1" : ""}`)),
  );

  server.registerTool(
    "staff_resolve_report",
    {
      title: "Resolve a report",
      description: "Closes a report. removePhoto deletes the reported photo for good and closes every report about it.",
      inputSchema: { reportId: z.string().uuid(), removePhoto: z.boolean().default(false) },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    logged("staff_resolve_report", async ({ reportId, removePhoto }: { reportId: string; removePhoto: boolean }) => answer("POST", `/admin/reports/${reportId}/resolve`, { removePhoto })),
  );

  server.registerTool(
    "staff_usage",
    {
      title: "Usage",
      description: "Calls to outside services by day (address search, satellite tiles and so on), for keeping an eye on free tiers.",
      inputSchema: { days: z.number().int().min(1).max(366).default(30) },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    logged("staff_usage", async ({ days }: { days: number }) => answer("GET", `/admin/usage?days=${days}`)),
  );

  server.registerTool(
    "staff_lookup_account",
    {
      title: "Look up an account",
      description: "An account by email: when it joined, how many dynamics it's in, and reports about it or by it. Nothing from inside a dynamic.",
      inputSchema: { email: z.string().email() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    logged("staff_lookup_account", async ({ email }: { email: string }) => answer("GET", `/admin/accounts?email=${encodeURIComponent(email)}`)),
  );
}
