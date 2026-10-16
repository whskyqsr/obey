// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const ME = "11111111-1111-4111-8111-111111111111";
const SUB = "22222222-2222-4222-8222-222222222222";
const REL = "33333333-3333-4333-8333-333333333333";
const now = new Date();
const iso = (h: number) => new Date(now.getTime() + h * 3_600_000).toISOString();

const routes: Record<string, unknown> = {
  "/me": {
    user: { id: ME, displayName: "Jake", email: null },
    relationships: [
      {
        id: REL,
        name: "Us",
        members: [
          { userId: ME, displayName: "Jake", role: "dominant" },
          { userId: SUB, displayName: "Sam", role: "submissive" },
        ],
        reschedulePolicy: "request",
        weeklyDelayAllowance: 2,
        createdAt: iso(-100),
      },
    ],
  },
  [`/relationships/${REL}/occurrences`]: [
    { id: "o1", seriesId: "s1", title: "Write lines", assigneeId: SUB, points: 5, originalDate: "2026-01-01", dueAt: iso(2), rescheduled: false, status: "pending", completedAt: null, noteMd: null },
    { id: "o2", seriesId: "s1", title: "Stretch", assigneeId: SUB, points: 3, originalDate: "2026-01-01", dueAt: iso(-30), rescheduled: false, status: "submitted", completedAt: iso(-29), noteMd: "done!" },
  ],
  [`/relationships/${REL}/reschedules`]: [
    { id: "r1", groupId: null, occurrenceId: "o1", title: "Write lines", requestedBy: SUB, scope: "this", fromDueAt: iso(2), toDueAt: iso(26), reason: "Late shift", status: "requested", createdAt: iso(-1) },
  ],
  [`/relationships/${REL}/tasks`]: [
    {
      id: "t1", relationshipId: REL, title: "Write lines", bodyMd: "", assigneeId: SUB, points: 5, missPenalty: 0, rewardId: null, consequenceId: null,
      proofRequired: false, approvalRequired: true, schedule: { start: "2026-10-01", rule: { freq: "weekly", interval: 2, byWeekday: ["MO", "TH"] } },
      dueTime: "21:00", timezone: "UTC", graceMinutes: 0, summary: "Every 2 weeks on Mon, Thu", active: true, createdBy: ME, createdAt: iso(-100),
    },
  ],
  [`/relationships/${REL}/balances`]: [{ userId: SUB, balance: 42 }],
  [`/relationships/${REL}/ledger`]: [{ id: "l1", userId: SUB, delta: 5, kind: "completion", note: "Write lines", createdBy: null, createdAt: iso(-3) }],
  [`/relationships/${REL}/rewards`]: [{ id: "w1", relationshipId: REL, title: "Movie night", bodyMd: "", cost: 30, needsApproval: true, createdAt: iso(-5) }],
  [`/relationships/${REL}/consequences`]: [{ id: "c1", relationshipId: REL, title: "Early bedtime", bodyMd: "", severity: 2, createdAt: iso(-5) }],
  [`/relationships/${REL}/rules`]: [{ id: "u1", relationshipId: REL, title: "Ask before sweets", bodyMd: "", category: "Health", position: 1, createdAt: iso(-5) }],
  [`/relationships/${REL}/notes`]: [
    { id: "n1", relationshipId: REL, authorId: ME, kind: "note", title: "Aftercare", bodyMd: "# Plan\n\n- [ ] blanket", visibility: "shared", tags: ["care"], pinned: true, mood: null, createdAt: iso(-5), updatedAt: iso(-4) },
  ],
};

const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
  const url = new URL(String(input));
  const body = routes[url.pathname];
  if (body === undefined) return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
});

beforeAll(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
  window.scrollTo = () => {};
  localStorage.setItem("obey.devUser", ME);
});
afterAll(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("app smoke test (dev auth, mocked API)", () => {
  it("renders every page without crashing", async () => {
    const { initSession } = await import("./auth/session");
    const { App } = await import("./App");
    const { ThemeProvider } = await import("./theme/ThemeProvider");
    const { SnackbarProvider } = await import("./components/ui");
    const { router } = await import("./router");
    await initSession();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ThemeProvider>
          <SnackbarProvider>
            <App />
          </SnackbarProvider>
        </ThemeProvider>
      </QueryClientProvider>,
    );

    await screen.findByText("Hi, Jake");
    await screen.findByText(/asks for more time on “Write lines”/);
    expect(await screen.findByText("Needs your review")).toBeTruthy();
    expect(fetchMock.mock.calls.some(([, init]) => (init?.headers as Record<string, string> | undefined)?.["X-Dev-User"] === ME)).toBe(true);
    expect(document.getElementById("obey-theme")?.textContent).toContain("--md-primary");

    const visit = async (to: string, text: string | RegExp) => {
      await act(() => router.navigate({ to } as never));
      await waitFor(() => expect(screen.getAllByText(text).length).toBeGreaterThan(0));
    };
    await visit("/calendar", "Calendar");
    await visit("/tasks", /Every 2 weeks on Mon, Thu at 21:00/);
    await visit("/tasks/t1", "Every 2 weeks on Mon, Thu");
    await visit("/tasks/new", "New task");
    await visit("/rewards", "Movie night");
    await visit("/consequences", "Early bedtime");
    await visit("/rules", "Ask before sweets");
    await visit("/notes", "Aftercare");
    await visit("/notes/n1", "blanket");
    await visit("/settings", "Seed color");
    await visit("/more", "More");
  });
});
