import { Suspense, lazy } from "react";
import { importPage } from "./lib/staleBuild";
import { createRootRoute, createRoute, createRouter, useNavigate } from "@tanstack/react-router";
import { AppShell } from "./components/AppShell";
import type { Features } from "./api/types";
import { Empty, ErrorBox, Loading, PageHeader } from "./components/ui";
import { useRel } from "./lib/relationship";
import { startWelcome, useWelcome } from "./lib/welcome";
import { CalendarPage } from "./pages/Calendar";
import { ConsequencesPage } from "./pages/Consequences";
import { DynamicPage } from "./pages/Dynamic";
import { AdminReportsPage } from "./pages/AdminReports";
import { MorePage } from "./pages/More";
import { NotesPage } from "./pages/Notes";
import { Onboarding } from "./pages/Onboarding";
import { RewardsPage } from "./pages/Rewards";
import { ProtocolsPage } from "./pages/Protocols";
import { RuleLogPage } from "./pages/RuleLog";
import { StatsPage } from "./pages/Stats";
import { MonthReviewPage } from "./pages/MonthReview";
import { KitsPage } from "./pages/Kits";
import { RulesPage } from "./pages/Rules";
import { SettingsPage } from "./pages/Settings";
import { TaskEditorPage } from "./pages/TaskEditor";
import { TasksPage } from "./pages/Tasks";
import { TodayPage } from "./pages/Today";
import { Welcome } from "./pages/Welcome";

// The notes editor pulls in TipTap/ProseMirror; load it on demand.
const NoteEditorPage = lazy(importPage(() => import("./pages/NoteEditor").then((m) => ({ default: m.NoteEditorPage }))));
// The task page renders Markdown details with the same editor.
const TaskPage = lazy(importPage(() => import("./pages/TaskPage").then((m) => ({ default: m.TaskPage }))));
const TaskHistoryPage = lazy(importPage(() => import("./pages/TaskPage").then((m) => ({ default: m.TaskHistoryPage }))));
const ProtocolPage = lazy(importPage(() => import("./pages/ProtocolPage").then((m) => ({ default: m.ProtocolPage }))));

/** The app, or the first-run setup for a dynamic someone just started or joined. */
function Root() {
  const { rel } = useRel();
  return useWelcome() === rel.id ? <Welcome /> : <AppShell />;
}

const rootRoute = createRootRoute({
  component: Root,
  notFoundComponent: () => <ErrorBox error="Page not found." />,
});

const page = <P extends string>(path: P, component: () => React.ReactNode) => createRoute({ getParentRoute: () => rootRoute, path, component });

const todayRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  // `task` is the task open in the side panel on wide screens.
  validateSearch: (s: Record<string, unknown>): { task?: string } => (typeof s.task === "string" ? { task: s.task } : {}),
  component: function TodayRoute() {
    const { task } = todayRoute.useSearch();
    return (
      <TodayPage
        selected={task}
        renderTask={(id, close) => (
          <Suspense fallback={<Loading />}>
            <TaskPage taskId={id} onClose={close} />
          </Suspense>
        )}
      />
    );
  },
});

const taskRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tasks/$taskId",
  // `start` (YYYY-MM-DD) seeds a new task's date, e.g. the day picked on the calendar.
  validateSearch: (s: Record<string, unknown>): { start?: string } => (typeof s.start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.start) ? { start: s.start } : {}),
  component: function TaskRoute() {
    const { taskId } = taskRoute.useParams();
    const { start } = taskRoute.useSearch();
    if (taskId === "new") return <TaskEditorPage taskId="new" start={start} />;
    return (
      <Suspense fallback={<Loading />}>
        <TaskPage taskId={taskId} />
      </Suspense>
    );
  },
});

const taskEditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tasks/$taskId/edit",
  component: function TaskEditRoute() {
    const { taskId } = taskEditRoute.useParams();
    return <TaskEditorPage taskId={taskId} />;
  },
});

const taskHistoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tasks/$taskId/history",
  component: function TaskHistoryRoute() {
    const { taskId } = taskHistoryRoute.useParams();
    return (
      <Suspense fallback={<Loading />}>
        <TaskHistoryPage taskId={taskId} />
      </Suspense>
    );
  },
});

/** Shows a page only while its feature is on, so an old link doesn't open a switched-off area. */
function Gate({ feature, children }: { feature: keyof Features; children: React.ReactNode }) {
  const { features } = useRel();
  if (features[feature]) return <>{children}</>;
  return (
    <div className="p-4 md:p-6">
      <Empty icon="toggle_off" title="This is switched off" body="A Dominant can turn it back on in Settings, under Features." />
    </div>
  );
}

const gated = (feature: keyof Features, Component: () => React.ReactNode) => () => (
  <Gate feature={feature}>
    <Component />
  </Gate>
);

const noteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/notes/$noteId",
  component: function NoteRoute() {
    const { noteId } = noteRoute.useParams();
    return (
      <Suspense fallback={<Loading />}>
        <NoteEditorPage noteId={noteId} kind="note" />
      </Suspense>
    );
  },
});

const journalEntryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/journal/$noteId",
  component: function JournalEntryRoute() {
    const { noteId } = journalEntryRoute.useParams();
    return (
      <Gate feature="journal">
        <Suspense fallback={<Loading />}>
          <NoteEditorPage noteId={noteId} kind="journal" />
        </Suspense>
      </Gate>
    );
  },
});

const protocolRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/protocols/$protocolId",
  component: function ProtocolRoute() {
    const { protocolId } = protocolRoute.useParams();
    return (
      <Gate feature="protocols">
        <Suspense fallback={<Loading />}>
          <ProtocolPage protocolId={protocolId} />
        </Suspense>
      </Gate>
    );
  },
});

function OnboardingRoute() {
  const navigate = useNavigate();
  const { select } = useRel();
  return (
    <>
      <PageHeader title="Add a relationship" subtitle="Start a new dynamic or join one with an invite code." />
      <div className="max-w-md px-4 md:px-6">
        <Onboarding
          embedded
          onDone={(id) => {
            select(id);
            startWelcome(id);
            void navigate({ to: "/" });
          }}
        />
      </div>
    </>
  );
}

const routeTree = rootRoute.addChildren([
  todayRoute,
  page("/calendar", CalendarPage),
  page("/tasks", TasksPage),
  taskRoute,
  taskEditRoute,
  taskHistoryRoute,
  page("/rewards", gated("points", RewardsPage)),
  page("/consequences", gated("consequences", ConsequencesPage)),
  page("/rules", gated("rules", RulesPage)),
  page("/protocols", gated("protocols", ProtocolsPage)),
  page("/rule-log", RuleLogPage),
  page("/kits", KitsPage),
  protocolRoute,
  page("/notes", () => <NotesPage kind="note" />),
  noteRoute,
  page(
    "/journal",
    gated("journal", () => <NotesPage kind="journal" />),
  ),
  journalEntryRoute,
  page("/stats", gated("stats", StatsPage)),
  page("/review", gated("review", MonthReviewPage)),
  page("/settings", SettingsPage),
  page("/dynamic", DynamicPage),
  page("/admin/reports", AdminReportsPage),
  page("/more", MorePage),
  page("/onboarding", OnboardingRoute),
]);

export const router = createRouter({ routeTree, defaultPreload: "intent", scrollRestoration: true });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
