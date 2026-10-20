import { cert, initializeApp, type App } from "firebase-admin/app";

export interface FirebaseSetup {
  app: App;
  /** Push needs real credentials; verifying ID tokens only needs the project id. */
  canSendPush: boolean;
}

/**
 * Initialises firebase-admin from a service account JSON string (sign-in and push), or from just a project id
 * (sign-in only). Returns null when neither is configured.
 */
export function initFirebase(serviceAccountJson: string | undefined, projectId?: string): FirebaseSetup | null {
  if (serviceAccountJson) return { app: initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) }), canSendPush: true };
  if (projectId) return { app: initializeApp({ projectId }), canSendPush: false };
  return null;
}
