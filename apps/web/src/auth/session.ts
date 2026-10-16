import { FIREBASE_ENABLED, firebaseConfig } from "../env";
import { storage } from "../lib/storage";
import type { FirebaseApp } from "firebase/app";
import type { Auth } from "firebase/auth";

/**
 * The signed-in identity, independent of how it was obtained.
 * - firebase: Google sign-in; requests carry `Authorization: Bearer <ID token>`.
 * - dev: a UUID typed on the sign-in screen; requests carry `X-Dev-User` (API must run with DEV_AUTH=1).
 */
export type Session =
  | { kind: "firebase"; uid: string; name: string | null; email: string | null }
  | { kind: "dev"; uid: string };

const DEV_USER_KEY = "obey.devUser";

type Listener = (s: Session | null) => void;
const listeners = new Set<Listener>();
let current: Session | null | undefined; // undefined = still loading
let app: FirebaseApp | null = null;
let auth: Auth | null = null;

function emit(s: Session | null) {
  current = s;
  for (const l of listeners) l(s);
}

export function getSession(): Session | null | undefined {
  return current;
}

export function onSession(listener: Listener): () => void {
  listeners.add(listener);
  if (current !== undefined) listener(current);
  return () => listeners.delete(listener);
}

export async function getFirebaseApp(): Promise<FirebaseApp> {
  if (app) return app;
  const { initializeApp } = await import("firebase/app");
  app = initializeApp(firebaseConfig as Record<string, string>);
  return app;
}

async function getFirebaseAuth(): Promise<Auth> {
  if (auth) return auth;
  const { getAuth } = await import("firebase/auth");
  auth = getAuth(await getFirebaseApp());
  return auth;
}

export async function initSession(): Promise<void> {
  if (!FIREBASE_ENABLED) {
    const uid = storage.get(DEV_USER_KEY);
    emit(uid ? { kind: "dev", uid } : null);
    return;
  }
  const a = await getFirebaseAuth();
  const { onIdTokenChanged } = await import("firebase/auth");
  onIdTokenChanged(a, (u) => {
    emit(u ? { kind: "firebase", uid: u.uid, name: u.displayName, email: u.email } : null);
  });
}

export async function signInWithGoogle(): Promise<void> {
  const a = await getFirebaseAuth();
  const { GoogleAuthProvider, signInWithPopup } = await import("firebase/auth");
  await signInWithPopup(a, new GoogleAuthProvider());
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function signInDev(uid: string): void {
  const clean = uid.trim().toLowerCase();
  if (!UUID_RE.test(clean)) throw new Error("Enter a UUID");
  storage.set(DEV_USER_KEY, clean);
  emit({ kind: "dev", uid: clean });
}

export async function signOut(): Promise<void> {
  if (FIREBASE_ENABLED) {
    const a = await getFirebaseAuth();
    const { signOut: fbSignOut } = await import("firebase/auth");
    await fbSignOut(a);
  } else {
    storage.set(DEV_USER_KEY, null);
    emit(null);
  }
}

/** Headers that identify the caller to the API. */
export async function authHeaders(): Promise<Record<string, string>> {
  const s = current;
  if (!s) return {};
  if (s.kind === "dev") return { "X-Dev-User": s.uid };
  const a = await getFirebaseAuth();
  const token = await a.currentUser?.getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
