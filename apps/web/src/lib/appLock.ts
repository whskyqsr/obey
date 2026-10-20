/**
 * App lock for this browser: a PIN kept only on this device (salted SHA-256 in localStorage, never sent anywhere).
 * It hides the app behind a PIN screen on load and after the tab has been away for the chosen time.
 */
import { useSyncExternalStore } from "react";

export interface LockConfig {
  salt: string;
  hash: string;
  /** Seconds away before it locks again; 0 locks every time the tab comes back. */
  after: number;
}

const key = (uid: string) => `obey.lock.${uid}`;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function read(uid: string): LockConfig | null {
  try {
    const raw = localStorage.getItem(key(uid));
    return raw ? (JSON.parse(raw) as LockConfig) : null;
  } catch {
    return null;
  }
}

async function digest(salt: string, pin: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${pin}`));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function setPin(uid: string, pin: string, after: number) {
  const salt = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
  localStorage.setItem(key(uid), JSON.stringify({ salt, hash: await digest(salt, pin), after } satisfies LockConfig));
  emit();
}

export function setLockAfter(uid: string, after: number) {
  const c = read(uid);
  if (!c) return;
  localStorage.setItem(key(uid), JSON.stringify({ ...c, after }));
  emit();
}

export function clearPin(uid: string) {
  try {
    localStorage.removeItem(key(uid));
  } catch {
    /* storage unavailable: nothing to clear */
  }
  emit();
}

export async function checkPin(uid: string, pin: string) {
  const c = read(uid);
  return !!c && (await digest(c.salt, pin)) === c.hash;
}

/** The lock settings for [uid], updating when they change. */
export function useLockConfig(uid: string): LockConfig | null {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => localStorage.getItem(key(uid)),
    () => null,
  ) === null
    ? null
    : read(uid);
}
