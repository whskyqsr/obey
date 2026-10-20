import { useSyncExternalStore } from "react";

/** Whether a CSS media query matches, kept in sync as the window resizes. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", onChange);
      return () => m.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** The wide desktop layout: Today shows a side panel instead of opening tasks as pages. */
export const WIDE = "(min-width: 1280px)";
