import { useSyncExternalStore } from "react";
import { storage } from "./storage";

const KEY = "obey.welcome";
const listeners = new Set<() => void>();

/**
 * The dynamic someone just started or joined, until they finish (or skip) the first-run setup. Kept in storage so a
 * reload mid-setup carries on where they were.
 */
export function startWelcome(relationshipId: string) {
  storage.set(KEY, relationshipId);
  listeners.forEach((l) => l());
}

export function finishWelcome() {
  storage.set(KEY, null);
  listeners.forEach((l) => l());
}

export function useWelcome(): string | null {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => storage.get(KEY),
  );
}
