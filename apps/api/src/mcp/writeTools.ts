import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { recurrenceRule, type Features } from "@obey/contracts";
import { z } from "zod";
import { type Call, failed, text } from "./tools.js";

type Logged = <A extends { relationshipId?: string }>(tool: string, run: (args: A) => Promise<CallToolResult>) => (args: A) => Promise<CallToolResult>;

/**
 * Every app route a write tool reaches. Invites, blocking, safe calls, leaving or ending a dynamic, account changes and
 * the AI access switch are deliberately missing: those stay in the app.
 */
export const WRITE_ROUTES = [
  "POST /occurrences/:id/reschedule",
  "POST /relationships/:id/reschedules/day",
  "POST /reschedules/:id/decide",
  "POST /curfew-requests/:id/approve",
  "POST /curfew-requests/:id/decline",
  "POST /occurrences/:id/review",
  "POST /relationships/:id/events",
  "PATCH /events/:id",
  "DELETE /events/:id",
  "POST /relationships/:id/notes",
  "PATCH /notes/:id",
  "DELETE /notes/:id",
  "POST /relationships/:id/tasks",
  "PATCH /tasks/:id",
  "DELETE /tasks/:id",
  "POST /relationships/:id/rules",
  "PATCH /rules/:id",
  "DELETE /rules/:id",
  "POST /relationships/:id/protocols",
  "PATCH /protocols/:id",
  "DELETE /protocols/:id",
  "POST /relationships/:id/rule-log",
];

const relationshipId = z.string().uuid().describe("The dynamic's id, from list_dynamics.");
const uuid = z.string().uuid();
const when = z.string().datetime({ offset: true }).describe("A date and time with its offset, e.g. 2026-11-24T21:00:00-05:00.");
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^\d{2}:\d{2}$/).describe("24-hour time, e.g. 21:30.");

const change = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const removal = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };

/** Drops keys the caller left out, so a PATCH only changes what was asked. */
const defined = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

export function registerWriteTools(server: McpServer, call: Call, logged: Logged) {
  /** Runs one app route and turns its refusal into the tool's error, in the app's own words. */
  const act = async (method: "POST" | "PATCH" | "DELETE", url: string, payload?: unknown) => {
    const res = await call(method, url, payload);
    if (res.status >= 400) {
      const body = res.body as { error?: string; details?: { message?: string }[] } | undefined;
      const detail = Array.isArray(body?.details) ? body.details.map((d) => d.message).filter(Boolean).join("; ") : "";
      return failed([body?.error ?? `Fealty said no (${res.status}).`, detail].filter(Boolean).join(": "));
    }
    return text(res.status === 204 ? { done: true } : res.body);
  };

  const switchedOn = async (rel: string, feature: keyof Features) => {
    const me = await call("GET", "/me");
    const r = (me.body as { relationships: { id: string; features: Features }[] }).relationships.find((x) => x.id === rel);
    return r ? r.features[feature] : false;
  };

  /** An item from one of the dynamic's lists, so edits and deletes stay inside the dynamic named (and its switches). */
  const inList = async (rel: string, path: string, itemId: string) => {
    const res = await call("GET", `/relationships/${rel}/${path}`);
    if (res.status >= 400) return failed((res.body as { error?: string } | undefined)?.error ?? "not found");
    return (res.body as { id: string }[]).some((x) => x.id === itemId) ? null : failed("not found");
  };

  // ---- More time and requests

  server.registerTool(
    "request_more_time",
    {
      title: "Ask for more time",
      description:
        "Moves one task's deadline, by hours or to a new time. For a submissive this asks the Dominant, or uses the weekly allowance, following the dynamic's rules; a Dominant moves it straight away.",
      inputSchema: {
        relationshipId,
        occurrenceId: uuid.describe("The task occurrence's id, from get_tasks_due."),
        delayHours: z.number().int().min(1).max(1440).optional(),
        dueAt: when.optional(),
        scope: z.enum(["this", "following"]).default("this").describe("This one only, or this and later ones."),
        reason: z.string().max(1000).optional(),
      },
      annotations: change,
    },
    logged("request_more_time", async (a: { relationshipId: string; occurrenceId: string; delayHours?: number; dueAt?: string; scope: string; reason?: string }) =>
      act("POST", `/occurrences/${a.occurrenceId}/reschedule`, defined({ delayHours: a.delayHours, dueAt: a.dueAt, scope: a.scope, reason: a.reason })),
    ),
  );

  server.registerTool(
    "request_more_time_today",
    {
      title: "More time for everything today",
      description: "One request that moves several of your open tasks by the same number of hours.",
      inputSchema: { relationshipId, occurrenceIds: z.array(uuid).min(1).max(50), delayHours: z.number().int().min(1).max(1440), reason: z.string().max(1000).optional() },
      annotations: change,
    },
    logged("request_more_time_today", async (a: { relationshipId: string; occurrenceIds: string[]; delayHours: number; reason?: string }) =>
      act("POST", `/relationships/${a.relationshipId}/reschedules/day`, defined({ occurrenceIds: a.occurrenceIds, delayHours: a.delayHours, reason: a.reason })),
    ),
  );

  server.registerTool(
    "decide_request",
    {
      title: "Answer a request",
      description: "A Dominant approves or declines a More time request or a curfew request (ids from get_pending).",
      inputSchema: { relationshipId, kind: z.enum(["more_time", "curfew"]), requestId: uuid, approve: z.boolean() },
      annotations: change,
    },
    logged("decide_request", async (a: { relationshipId: string; kind: "more_time" | "curfew"; requestId: string; approve: boolean }) =>
      a.kind === "more_time"
        ? act("POST", `/reschedules/${a.requestId}/decide`, { approve: a.approve })
        : act("POST", `/curfew-requests/${a.requestId}/${a.approve ? "approve" : "decline"}`, {}),
    ),
  );

  server.registerTool(
    "review_task",
    {
      title: "Review a task",
      description: "A Dominant approves or sends back a task that was sent in for review, with an optional comment.",
      inputSchema: { relationshipId, occurrenceId: uuid, approve: z.boolean(), comment: z.string().max(2000).optional() },
      annotations: change,
    },
    logged("review_task", async (a: { relationshipId: string; occurrenceId: string; approve: boolean; comment?: string }) =>
      act("POST", `/occurrences/${a.occurrenceId}/review`, defined({ approve: a.approve, comment: a.comment })),
    ),
  );

  // ---- Plans

  server.registerTool(
    "add_plan",
    {
      title: "Add a plan",
      description: "Adds a plan to the shared calendar. withPartner means both of you are in it, so the partner's tasks can clash with it too.",
      inputSchema: { relationshipId, title: z.string().min(1).max(80), startsAt: when, endsAt: when, allDay: z.boolean().default(false), withPartner: z.boolean().default(false), note: z.string().max(2000).optional() },
      annotations: change,
    },
    logged("add_plan", async (a: { relationshipId: string; title: string; startsAt: string; endsAt: string; allDay: boolean; withPartner: boolean; note?: string }) =>
      act("POST", `/relationships/${a.relationshipId}/events`, defined({ title: a.title, startsAt: a.startsAt, endsAt: a.endsAt, allDay: a.allDay, withPartner: a.withPartner, noteMd: a.note })),
    ),
  );

  server.registerTool(
    "edit_plan",
    {
      title: "Change a plan",
      description: "Changes a plan you added. A Dominant may only move when someone else's plan ends.",
      inputSchema: { relationshipId, planId: uuid, title: z.string().min(1).max(80).optional(), startsAt: when.optional(), endsAt: when.optional(), withPartner: z.boolean().optional(), note: z.string().max(2000).optional() },
      annotations: change,
    },
    logged("edit_plan", async (a: { relationshipId: string; planId: string; title?: string; startsAt?: string; endsAt?: string; withPartner?: boolean; note?: string }) =>
      act("PATCH", `/events/${a.planId}`, defined({ title: a.title, startsAt: a.startsAt, endsAt: a.endsAt, withPartner: a.withPartner, noteMd: a.note })),
    ),
  );

  server.registerTool(
    "delete_plan",
    { title: "Delete a plan", description: "Deletes a plan you added.", inputSchema: { relationshipId, planId: uuid }, annotations: removal },
    logged("delete_plan", async (a: { relationshipId: string; planId: string }) => act("DELETE", `/events/${a.planId}`)),
  );

  // ---- Notes and journal

  server.registerTool(
    "add_note",
    {
      title: "Write a note or journal entry",
      description: "Writes a note or a journal entry in Markdown. Private ones are only ever seen by you.",
      inputSchema: {
        relationshipId,
        kind: z.enum(["note", "journal"]).default("note"),
        title: z.string().max(200).default(""),
        body: z.string().min(1).max(100_000),
        visibility: z.enum(["shared", "private"]).default("shared"),
        mood: z.number().int().min(1).max(5).optional(),
      },
      annotations: change,
    },
    logged("add_note", async (a: { relationshipId: string; kind: "note" | "journal"; title: string; body: string; visibility: string; mood?: number }) => {
      if (a.kind === "journal" && !(await switchedOn(a.relationshipId, "journal"))) return failed("The journal is switched off for this dynamic.");
      return act("POST", `/relationships/${a.relationshipId}/notes`, defined({ kind: a.kind, title: a.title, bodyMd: a.body, visibility: a.visibility, mood: a.mood }));
    }),
  );

  server.registerTool(
    "edit_note",
    {
      title: "Change a note",
      description: "Changes a note or journal entry you may edit in the app. The text replaces what's there.",
      inputSchema: { relationshipId, noteId: uuid, title: z.string().max(200).optional(), body: z.string().min(1).max(100_000).optional(), visibility: z.enum(["shared", "private"]).optional() },
      annotations: change,
    },
    logged("edit_note", async (a: { relationshipId: string; noteId: string; title?: string; body?: string; visibility?: string }) =>
      (await inList(a.relationshipId, "notes", a.noteId)) ?? act("PATCH", `/notes/${a.noteId}`, defined({ title: a.title, bodyMd: a.body, visibility: a.visibility })),
    ),
  );

  server.registerTool(
    "delete_note",
    { title: "Delete a note", description: "Deletes a note or journal entry you wrote.", inputSchema: { relationshipId, noteId: uuid }, annotations: removal },
    logged("delete_note", async (a: { relationshipId: string; noteId: string }) => (await inList(a.relationshipId, "notes", a.noteId)) ?? act("DELETE", `/notes/${a.noteId}`)),
  );

  // ---- Tasks (Dominants)

  server.registerTool(
    "create_task",
    {
      title: "Create a task",
      description: "A Dominant sets a task. Leave repeat out for a one-off task; repeat follows RRULE-like fields (freq daily/weekly/monthly/yearly/cycle, interval, byWeekday MO..SU).",
      inputSchema: {
        relationshipId,
        title: z.string().min(1).max(200),
        details: z.string().max(20_000).default(""),
        assigneeId: uuid.describe("Who does it, from list_dynamics."),
        start: day.describe("The first day it's due."),
        dueTime: time.optional().describe("Leave out for any time that day."),
        timezone: z.string().min(1).describe("IANA time zone, e.g. America/Detroit."),
        repeat: recurrenceRule.optional(),
        points: z.number().int().min(-10_000).max(10_000).default(0),
        missPenalty: z.number().int().min(0).max(10_000).default(0),
        graceMinutes: z.number().int().min(0).max(10_080).default(0),
        approvalRequired: z.boolean().default(false),
        proofRequired: z.boolean().default(false),
        askMood: z.boolean().default(false),
        asksJournal: z.boolean().default(false),
      },
      annotations: change,
    },
    logged("create_task", async (a: Record<string, unknown> & { relationshipId: string; start: string; repeat?: unknown; details: string }) => {
      const { relationshipId: rel, start, repeat, details, ...rest } = a;
      return act("POST", `/relationships/${rel}/tasks`, defined({ ...rest, bodyMd: details, schedule: defined({ start, rule: repeat }) }));
    }),
  );

  server.registerTool(
    "edit_task",
    {
      title: "Change a task",
      description: "A Dominant changes a task's title, details, time, points or options. Only the fields given change.",
      inputSchema: {
        relationshipId,
        taskId: uuid.describe("The task's id, from list_tasks."),
        title: z.string().min(1).max(200).optional(),
        details: z.string().max(20_000).optional(),
        dueTime: time.nullable().optional(),
        points: z.number().int().min(-10_000).max(10_000).optional(),
        missPenalty: z.number().int().min(0).max(10_000).optional(),
        graceMinutes: z.number().int().min(0).max(10_080).optional(),
        approvalRequired: z.boolean().optional(),
        proofRequired: z.boolean().optional(),
      },
      annotations: change,
    },
    logged("edit_task", async (a: Record<string, unknown> & { relationshipId: string; taskId: string; details?: string }) => {
      const { relationshipId: rel, taskId, details, ...rest } = a;
      return (await inList(rel, "tasks", taskId)) ?? act("PATCH", `/tasks/${taskId}`, defined({ ...rest, bodyMd: details }));
    }),
  );

  server.registerTool(
    "delete_task",
    { title: "Delete a task", description: "A Dominant deletes a task and its upcoming occurrences. Past ones stay in the history.", inputSchema: { relationshipId, taskId: uuid }, annotations: removal },
    logged("delete_task", async (a: { relationshipId: string; taskId: string }) => (await inList(a.relationshipId, "tasks", a.taskId)) ?? act("DELETE", `/tasks/${a.taskId}`)),
  );

  // ---- Rules and protocols (Dominants)

  const list = (kind: "rules" | "protocols", feature: keyof Features, noun: string) => {
    const offMessage = `${noun[0]!.toUpperCase()}${noun.slice(1)}s are switched off for this dynamic.`;
    const gate = async (rel: string) => ((await switchedOn(rel, feature)) ? null : failed(offMessage));
    const extra: Record<string, z.ZodType> = kind === "protocols" ? { ruleId: uuid.nullable().optional().describe("The rule this protocol spells out, if any.") } : {};

    server.registerTool(
      `add_${noun}`,
      { title: `Add a ${noun}`, description: `A Dominant adds a ${noun}, at the end of the list.`, inputSchema: { relationshipId, title: z.string().min(1).max(200), details: z.string().max(5_000).default(""), ...extra }, annotations: change },
      logged(`add_${noun}`, async (a: { relationshipId: string; title: string; details: string; ruleId?: string | null }) => {
        const off = await gate(a.relationshipId);
        if (off) return off;
        const existing = await call("GET", `/relationships/${a.relationshipId}/${kind}`);
        const position = Array.isArray(existing.body) ? existing.body.length : 0;
        return act("POST", `/relationships/${a.relationshipId}/${kind}`, defined({ title: a.title, bodyMd: a.details, ruleId: a.ruleId, position }));
      }),
    );

    server.registerTool(
      `edit_${noun}`,
      { title: `Change a ${noun}`, description: `A Dominant changes a ${noun}'s title or details.`, inputSchema: { relationshipId, id: uuid, title: z.string().min(1).max(200).optional(), details: z.string().max(5_000).optional(), ...extra }, annotations: change },
      logged(`edit_${noun}`, async (a: { relationshipId: string; id: string; title?: string; details?: string; ruleId?: string | null }) =>
        (await gate(a.relationshipId)) ?? (await inList(a.relationshipId, kind, a.id)) ?? act("PATCH", `/${kind}/${a.id}`, defined({ title: a.title, bodyMd: a.details, ruleId: a.ruleId })),
      ),
    );

    server.registerTool(
      `delete_${noun}`,
      { title: `Delete a ${noun}`, description: `A Dominant deletes a ${noun}.`, inputSchema: { relationshipId, id: uuid }, annotations: removal },
      logged(`delete_${noun}`, async (a: { relationshipId: string; id: string }) => (await gate(a.relationshipId)) ?? (await inList(a.relationshipId, kind, a.id)) ?? act("DELETE", `/${kind}/${a.id}`)),
    );
  };
  list("rules", "rules", "rule");
  list("protocols", "protocols", "protocol");

  server.registerTool(
    "log_broken_rule",
    {
      title: "Log a broken rule",
      description: "Records a broken rule or protocol. A Dominant logs it for anyone; a submissive can only own up to their own.",
      inputSchema: { relationshipId, subjectId: uuid.describe("Who broke it."), ruleId: uuid.optional(), protocolId: uuid.optional(), note: z.string().max(2000).default(""), occurredOn: day },
      annotations: change,
    },
    logged("log_broken_rule", async (a: { relationshipId: string; subjectId: string; ruleId?: string; protocolId?: string; note: string; occurredOn: string }) => {
      if (!(await switchedOn(a.relationshipId, "rules"))) return failed("Rules are switched off for this dynamic.");
      return act("POST", `/relationships/${a.relationshipId}/rule-log`, defined({ subjectId: a.subjectId, ruleId: a.ruleId ?? null, protocolId: a.protocolId ?? null, note: a.note, occurredOn: a.occurredOn }));
    }),
  );
}
