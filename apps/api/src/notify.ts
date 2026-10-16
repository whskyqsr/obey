import { inArray } from "drizzle-orm";
import type { App as FirebaseApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import type { Db } from "./db/index.js";
import { devices } from "./db/schema.js";

export interface Push {
  /** Kept discreet by default: the lock screen shows this, so no task titles. */
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface Notifier {
  send(userIds: string[], push: Push): Promise<void>;
}

export const noopNotifier: Notifier = { send: async () => {} };

/** Records pushes instead of sending them; for tests. */
export function memoryNotifier(): Notifier & { sent: { userIds: string[]; push: Push }[] } {
  const sent: { userIds: string[]; push: Push }[] = [];
  return { sent, send: async (userIds, push) => void sent.push({ userIds, push }) };
}

export function fcmNotifier(db: Db, app: FirebaseApp, log: (msg: string) => void = console.error): Notifier {
  const messaging = getMessaging(app);
  return {
    async send(userIds, push) {
      if (userIds.length === 0) return;
      const rows = await db.select().from(devices).where(inArray(devices.userId, userIds));
      if (rows.length === 0) return;
      const res = await messaging.sendEachForMulticast({
        tokens: rows.map((r) => r.token),
        notification: { title: push.title, body: push.body },
        data: push.data,
        android: { priority: "high" },
      });
      const stale = res.responses
        .map((r, i) => (r.error?.code === "messaging/registration-token-not-registered" ? rows[i]!.token : null))
        .filter((t): t is string => t !== null);
      if (stale.length) await db.delete(devices).where(inArray(devices.token, stale));
      if (res.failureCount > stale.length) log(`FCM: ${res.failureCount - stale.length} sends failed`);
    },
  };
}
