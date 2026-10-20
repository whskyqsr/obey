import { useCanGoBack, useRouter } from "@tanstack/react-router";

/** Back to wherever the page was opened from; `fallback` when it was opened directly from a link. */
export function useBack(fallback: () => void) {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  return () => (canGoBack ? router.history.back() : fallback());
}
