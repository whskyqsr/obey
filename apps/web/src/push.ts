import { PUSH_ENABLED, VAPID_KEY } from "./env";
import { getFirebaseApp } from "./auth/session";
import { api } from "./api/client";
import { storage } from "./lib/storage";

export type PushState = "unavailable" | "default" | "denied" | "granted";

export function pushState(): PushState {
  if (!PUSH_ENABLED || typeof Notification === "undefined" || !("serviceWorker" in navigator)) return "unavailable";
  return Notification.permission as PushState;
}

/**
 * Registers this browser for FCM web push and tells the API about the token.
 * Only runs when Firebase config and VITE_FIREBASE_VAPID_KEY are set. Pass `prompt: true`
 * from a user gesture to ask for permission; otherwise it only refreshes an existing grant.
 */
export async function registerPush({ prompt = false } = {}): Promise<PushState> {
  if (pushState() === "unavailable") return "unavailable";
  const { isSupported, getMessaging, getToken } = await import("firebase/messaging");
  if (!(await isSupported())) return "unavailable";
  let permission = Notification.permission;
  if (permission === "default" && prompt) permission = await Notification.requestPermission();
  if (permission !== "granted") return permission as PushState;

  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  const messaging = getMessaging(await getFirebaseApp());
  const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
  if (token) {
    await api("/devices", { method: "POST", body: { token, platform: "web" } });
    storage.set(TOKEN_KEY, token);
  }
  return "granted";
}

const TOKEN_KEY = "obey.pushToken";

/** The end of this browser's push token, to find it among the account's devices. */
export const myTokenTail = () => storage.get(TOKEN_KEY)?.slice(-12) ?? null;

/** When the service worker last received a push in this browser, if ever. */
export async function lastReceived(): Promise<Date | null> {
  try {
    const res = await (await caches.open("obey-push")).match("/__last-push");
    return res ? new Date(await res.text()) : null;
  } catch {
    return null;
  }
}
