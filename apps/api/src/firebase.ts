import { cert, initializeApp, type App } from "firebase-admin/app";

/** Initialises firebase-admin from a service account JSON string, or returns null when not configured. */
export function initFirebase(serviceAccountJson: string | undefined): App | null {
  if (!serviceAccountJson) return null;
  return initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
}
