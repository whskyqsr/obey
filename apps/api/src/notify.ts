import { eq, inArray } from "drizzle-orm";
import type { App as FirebaseApp } from "firebase-admin/app";
import { type MulticastMessage, getMessaging } from "firebase-admin/messaging";
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

/**
 * Web gets a normal notification. Android gets data only, so the app always draws the
 * notification itself and can title it with the discreet-mode name instead of "Obey".
 */
export function fcmMessages(rows: { token: string; platform: "android" | "web" }[], push: Push): MulticastMessage[] {
  const web = rows.filter((r) => r.platform === "web").map((r) => r.token);
  const android = rows.filter((r) => r.platform === "android").map((r) => r.token);
  const messages: MulticastMessage[] = [];
  if (web.length) messages.push({ tokens: web, notification: { title: push.title, body: push.body }, data: push.data });
  if (android.length) messages.push({ tokens: android, data: { ...push.data, body: push.body }, android: { priority: "high" } });
  return messages;
}

export function fcmNotifier(db: Db, app: FirebaseApp, log: (msg: string) => void = console.error): Notifier {
  const messaging = getMessaging(app);
  return {
    async send(userIds, push) {
      if (userIds.length === 0) return;
      const rows = await db.select().from(devices).where(inArray(devices.userId, userIds));
      if (rows.length === 0) return;
      for (const message of fcmMessages(rows, push)) {
        const res = await messaging.sendEachForMulticast(message);
        const stale = res.responses
          .map((r, i) => (r.error?.code === "messaging/registration-token-not-registered" ? message.tokens[i]! : null))
          .filter((t): t is string => t !== null);
        if (stale.length) await db.delete(devices).where(inArray(devices.token, stale));
        if (res.failureCount > stale.length) log(`FCM: ${res.failureCount - stale.length} sends failed`);
        // Kept per device so Settings can say whether push is actually getting through.
        const sent = message.tokens.filter((_, i) => res.responses[i]!.success);
        if (sent.length) await db.update(devices).set({ lastSentAt: new Date(), lastError: null }).where(inArray(devices.token, sent));
        for (const [i, r] of res.responses.entries()) {
          const token = message.tokens[i]!;
          if (r.error && !stale.includes(token)) await db.update(devices).set({ lastError: r.error.code }).where(eq(devices.token, token));
        }
      }
    },
  };
}
