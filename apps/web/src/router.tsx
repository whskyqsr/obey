import { Suspense, lazy } from "react";
import { createRootRoute, createRoute, createRouter, useNavigate } from "@tanstack/react-router";
import { AppShell } from "./components/AppShell";
import { ErrorBox, Loading, PageHeader } from "./components/ui";
import { useRel } from "./lib/relationship";
import { CalendarPage } from "./pages/Calendar";
import { ConsequencesPage } from "./pages/Consequences";
import { MorePage } from "./pages/More";
import { NotesPage } from "./pages/Notes";
import { Onboarding } from "./pages/Onboarding";
import { RewardsPage } from "./pages/Rewards";
import { RulesPage } from "./pages/Rules";
import { SettingsPage } from "./pages/Settings";
import { TaskEditorPage } from "./pages/TaskEditor";
import { TasksPage } from "./pages/Tasks";
import { TodayPage } from "./pages/Today";

// The notes editor pulls in TipTap/ProseMirror; load it on demand.
const NoteEditorPage = lazy(() => import("./pages/NoteEditor").then((m) => ({ default: m.NoteEditorPage })));

const rootRoute = createRootRoute({
  component: AppShell,
  notFoundComponent: () => <ErrorBox error="Page not found." />,
});

const page = <P extends string>(path: P, component: () => React.ReactNode) => createRoute({ getParentRoute: () => rootRoute, path, component });

const taskRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tasks/$taskId",
  component: function TaskRoute() {
    const { taskId } = taskRoute.useParams();
    return <TaskEditorPage taskId={taskId} />;
  },
});

const noteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/notes/$noteId",
  component: function NoteRoute() {
    const { noteId } = noteRoute.useParams();
    return (
      <Suspense fallback={<Loading />}>
        <NoteEditorPage noteId={noteId} />
      </Suspense>
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
            void navigate({ to: "/" });
          }}
        />
      </div>
    </>
  );
}

const routeTree = rootRoute.addChildren([
  page("/", TodayPage),
  page("/calendar", CalendarPage),
  page("/tasks", TasksPage),
  taskRoute,
  page("/rewards", RewardsPage),
  page("/consequences", ConsequencesPage),
  page("/rules", RulesPage),
  page("/notes", NotesPage),
  noteRoute,
  page("/settings", SettingsPage),
  page("/more", MorePage),
  page("/onboarding", OnboardingRoute),
]);

export const router = createRouter({ routeTree, defaultPreload: "intent", scrollRestoration: true });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
