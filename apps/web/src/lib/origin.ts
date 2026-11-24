import { useRouterState } from "@tanstack/react-router";

/**
 * Where each entry in this tab's history went, by history index, so a page can name the page it was opened from and
 * go back to it ("‹ Week" after opening All tasks from Week). Only pages seen in this session are known.
 */
const seen = new Map<number, string>();

export function useHistoryTrail(): { index: number; at(i: number): string | undefined } {
  const loc = useRouterState({ select: (s) => ({ pathname: s.location.pathname, index: (s.location.state as { __TSR_index?: number }).__TSR_index ?? 0 }) });
  seen.set(loc.index, loc.pathname);
  return { index: loc.index, at: (i) => seen.get(i) };
}
