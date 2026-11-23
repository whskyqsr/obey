import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";

/**
 * Opens a page's "new" dialog when the page is reached with `?new=1`, as the + menu does, then drops the parameter so
 * going back or reloading doesn't open it again.
 */
export function useOpenOnNew(open: () => void, enabled = true) {
  const flag = useRouterState({ select: (s) => (s.location.search as Record<string, unknown>).new });
  const navigate = useNavigate();
  useEffect(() => {
    if (!flag || !enabled) return;
    open();
    void navigate({ to: ".", search: {}, replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flag, enabled]);
}
