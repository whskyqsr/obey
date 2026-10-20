const env = import.meta.env;

export const API_URL = String(env.VITE_API_URL || "http://localhost:3000").replace(/\/+$/, "");

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
};

/** Firebase auth is used when the web config is present; otherwise the app runs in dev-auth mode. */
export const FIREBASE_ENABLED = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

export const VAPID_KEY = (env.VITE_FIREBASE_VAPID_KEY as string | undefined) || undefined;

/** Web push needs Firebase, a VAPID key and a sender id. */
export const PUSH_ENABLED = FIREBASE_ENABLED && Boolean(VAPID_KEY && firebaseConfig.messagingSenderId);
