/**
 * After a deploy, a tab still running the old build asks for page files that no longer exist ("Failed to fetch
 * dynamically imported module"). Reloading picks up the new build. The timestamp guard stops a reload loop if the
 * file is missing for some other reason.
 */
const KEY = "fealty.staleReloadAt";

export function reloadForNewBuild(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < 30_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // No session storage: reload anyway; the browser's own back-off is the guard.
  }
  window.location.reload();
  return true;
}

/** A dynamic import that reloads the page when its file belongs to an older build. */
export function importPage<T>(load: () => Promise<T>): () => Promise<T> {
  return () =>
    load().catch((err: unknown) => {
      // Reloading never resolves; keep the import pending so nothing flashes an error first.
      if (reloadForNewBuild()) return new Promise<T>(() => {});
      throw err;
    });
}

/** Vite's own signal when a chunk's preloaded dependencies fail to load. */
export function watchForNewBuild() {
  window.addEventListener("vite:preloadError", (event) => {
    if (reloadForNewBuild()) event.preventDefault();
  });
}
