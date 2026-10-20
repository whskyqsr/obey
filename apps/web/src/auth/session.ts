import { API_URL, FIREBASE_ENABLED, firebaseConfig } from "../env";
import { clearPin } from "../lib/appLock";
import { storage } from "../lib/storage";
import type { FirebaseApp } from "firebase/app";
import type { Auth } from "firebase/auth";

/**
 * The signed-in identity, independent of how it was obtained.
 * - firebase: Google sign-in; requests carry `Authorization: Bearer <ID token>`.
 * - dev: a UUID typed on the sign-in screen; requests carry `X-Dev-User` (API must run with DEV_AUTH=1).
 */
export type Session =
  | { kind: "firebase"; uid: string; name: string | null; email: string | null; provider: "google" | "password" | null; verified: boolean }
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
  onIdTokenChanged(a, (u) => emit(u ? firebaseSession(u) : null));
}

function firebaseSession(u: import("firebase/auth").User): Session {
  const p = u.providerData[0]?.providerId;
  const provider = p === "google.com" ? "google" : p === "password" ? "password" : null;
  return { kind: "firebase", uid: u.uid, name: u.displayName, email: u.email, provider, verified: u.emailVerified };
}

/** Email-and-password accounts must confirm their address before the API lets them in. */
export function needsVerification(s: Session): boolean {
  return s.kind === "firebase" && s.provider === "password" && !s.verified;
}

export async function signInWithGoogle(): Promise<void> {
  const a = await getFirebaseAuth();
  const { GoogleAuthProvider, signInWithPopup } = await import("firebase/auth");
  await signInWithPopup(a, new GoogleAuthProvider());
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const a = await getFirebaseAuth();
  const { signInWithEmailAndPassword } = await import("firebase/auth");
  await signInWithEmailAndPassword(a, email.trim(), password);
}

export async function createAccount(email: string, password: string): Promise<void> {
  const a = await getFirebaseAuth();
  const { createUserWithEmailAndPassword } = await import("firebase/auth");
  const cred = await createUserWithEmailAndPassword(a, email.trim(), password);
  // The account exists either way; a failed email can be resent from the Check your email screen.
  await sendVerificationEmail(cred.user).catch(() => {});
}

export async function resendVerification(): Promise<void> {
  const a = await getFirebaseAuth();
  if (a.currentUser) await sendVerificationEmail(a.currentUser);
}

/** Our own branded email from the app's domain; Firebase's stock email when the server can't send one. */
async function sendVerificationEmail(user: import("firebase/auth").User): Promise<void> {
  const res = await fetch(`${API_URL}/me/verification-email`, { method: "POST", headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
  if (res.status === 429) throw new Error("We just sent one. Wait a minute before asking for another.");
  const body = (await res.json().catch(() => null)) as { sent?: boolean } | null;
  if (res.ok && body?.sent) return;
  const { sendEmailVerification } = await import("firebase/auth");
  await sendEmailVerification(user, { url: location.origin });
}

/** Applies the one-time code from our verification email's link. */
export async function confirmEmail(code: string): Promise<void> {
  const a = await getFirebaseAuth();
  const { applyActionCode } = await import("firebase/auth");
  await applyActionCode(a, code);
  if (a.currentUser) await refreshVerification();
}

/** Re-reads the account after the person clicks the link; returns whether it is verified now. */
export async function refreshVerification(): Promise<boolean> {
  const a = await getFirebaseAuth();
  const u = a.currentUser;
  if (!u) return false;
  await u.reload();
  // A fresh ID token carries email_verified=true for the API; onIdTokenChanged then emits the new session.
  await u.getIdToken(true);
  emit(firebaseSession(u));
  return u.emailVerified;
}

/** Firebase errors read like "Firebase: Error (auth/invalid-credential)."; say something a person can act on. */
export function authErrorMessage(e: unknown): string | null {
  const code = (e as { code?: string } | null)?.code;
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "That email and password don't match an account.";
    case "auth/email-already-in-use":
      return "There's already an account with that email. Sign in instead.";
    case "auth/weak-password":
      return "Use a password of at least 6 characters.";
    case "auth/invalid-email":
      return "That doesn't look like an email address.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return null;
    case "auth/unauthorized-domain":
      return "Sign-in isn't enabled for this website yet.";
    case "auth/operation-not-allowed":
      return "This sign-in method isn't turned on yet.";
    case "auth/invalid-action-code":
    case "auth/expired-action-code":
      return "This link has expired or was already used.";
    case "auth/too-many-requests":
      return "Too many tries. Wait a minute and try again.";
    default:
      return null;
  }
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function signInDev(uid: string): void {
  const clean = uid.trim().toLowerCase();
  if (!UUID_RE.test(clean)) throw new Error("Enter a UUID");
  storage.set(DEV_USER_KEY, clean);
  emit({ kind: "dev", uid: clean });
}

export async function signOut(): Promise<void> {
  // The app lock belongs to this sign-in on this browser.
  if (current) clearPin(current.uid);
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
export async function authHeaders(freshToken = false): Promise<Record<string, string>> {
  const s = current;
  if (!s) return {};
  if (s.kind === "dev") return { "X-Dev-User": s.uid };
  const a = await getFirebaseAuth();
  const token = await a.currentUser?.getIdToken(freshToken);
  return token ? { Authorization: `Bearer ${token}` } : {};
}
