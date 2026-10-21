import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "./api/client";
import { App } from "./App";
import { initSession } from "./auth/session";
import { captureInviteLink } from "./lib/invite";
import { watchForNewBuild } from "./lib/staleBuild";
import { SnackbarProvider } from "./components/ui";
import { ThemeProvider } from "./theme/ThemeProvider";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      refetchOnWindowFocus: true,
    },
  },
});

watchForNewBuild();
captureInviteLink();
void initSession();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <SnackbarProvider>
          <App />
        </SnackbarProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
