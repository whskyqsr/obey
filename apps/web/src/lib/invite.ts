import { storage } from "./storage";

const KEY = "obey.pendingInvite";
const PATH = /^\/join\/([A-Za-z0-9]{4,16})\/?$/;

/** The link a partner opens to join: `<origin>/join/<code>`. */
export const inviteLink = (code: string) => `${window.location.origin}/join/${code}`;

/** An invite code from a link or a bare code, or null. */
export function parseInvite(text: string): string | null {
  const t = text.trim();
  const fromLink = t.match(/\/join\/([A-Za-z0-9]{4,16})/);
  if (fromLink) return fromLink[1]!.toUpperCase();
  return /^[A-Za-z0-9]{4,16}$/.test(t) ? t.toUpperCase() : null;
}

/**
 * Remembers an invite link's code before sign-in, so it survives creating an account or a Google sign-in,
 * and moves the address back to the app's root. Call once at startup.
 */
export function captureInviteLink() {
  const m = window.location.pathname.match(PATH);
  if (!m) return;
  storage.set(KEY, m[1]!.toUpperCase());
  window.history.replaceState(null, "", "/");
}

export const pendingInvite = () => storage.get(KEY);
export const clearPendingInvite = () => storage.set(KEY, null);
