import { eq, inArray } from "drizzle-orm";
import { DateTime } from "luxon";
import type { App as FirebaseApp } from "firebase-admin/app";
import { type MulticastMessage, getMessaging } from "firebase-admin/messaging";
import type { NotifyCategory } from "@obey/contracts";
import type { Db } from "./db/index.js";
import { devices, users } from "./db/schema.js";

export interface Push {
  /** Kept discreet by default: the lock screen shows this, so no task titles. */
  title: string;
  body: string;
  data?: Record<string, string>;
  /** Comes through quiet hours with sound; only for safe calls. */
  urgent?: boolean;
}

export interface Notifier {
  send(userIds: string[], push: Push): Promise<void>;
}

export const noopNotifier: Notifier = { send: async () => {} };

/** Which setting turns a push off, by its data.type; types not listed always come through. */
const CATEGORY: Record<string, NotifyCategory> = {
  reminder: "reminders",
  occurrence_submitted: "completions",
  occurrence_completed: "completions",
  occurrence_reviewed: "completions",
  occurrence_missed: "missed",
  reschedule_requested: "requests",
  reschedule_decided: "requests",
  rescheduled: "requests",
  occurrence_comment: "comments",
  note_comment: "comments",
  task_assigned: "assigned",
  occurrence_edited: "assigned",
  rule_log: "assigned",
  event_changed: "plans",
  reward_redeemed: "rewards",
};
export const categoryOf = (type: string | undefined): NotifyCategory | null => (type ? (CATEGORY[type] ?? null) : null);

/** Drops people who turned this kind of notification off, then hands the rest to [inner]. */
export function withPreferences(db: Db, inner: Notifier): Notifier {
  return {
    async send(userIds, push) {
      const category = categoryOf(push.data?.type);
      if (category && userIds.length) {
        const rows = await db.select({ id: users.id, muted: users.mutedNotifications }).from(users).where(inArray(users.id, userIds));
        const off = new Set(rows.filter((r) => r.muted.includes(category)).map((r) => r.id));
        userIds = userIds.filter((id) => !off.has(id));
      }
      if (userIds.length) await inner.send(userIds, push);
    },
  };
}

/** Records pushes instead of sending them; for tests. */
export function memoryNotifier(): Notifier & { sent: { userIds: string[]; push: Push }[] } {
  const sent: { userIds: string[]; push: Push }[] = [];
  return { sent, send: async (userIds, push) => void sent.push({ userIds, push }) };
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Whether [now] falls in someone's quiet hours; a start after the end spans midnight. */
export function isQuiet(q: { start: string; end: string; timezone: string } | null, now: Date): boolean {
  if (!q) return false;
  const local = DateTime.fromJSDate(now).setZone(q.timezone);
  if (!local.isValid) return false;
  const t = local.hour * 60 + local.minute;
  const [s, e] = [minutes(q.start), minutes(q.end)];
  if (s === e) return false;
  return s < e ? t >= s && t < e : t >= s || t < e;
}

/**
 * Web gets a normal notification. Android gets data only, so the app always draws the
 * notification itself and can title it with the discreet-mode name instead of "Fealty".
 * Devices in quiet hours still get the push, but without sound or vibration.
 */
export function fcmMessages(rows: { token: string; platform: "android" | "web"; quiet?: boolean }[], push: Push): MulticastMessage[] {
  const messages: MulticastMessage[] = [];
  for (const quiet of [false, true]) {
    const mine = rows.filter((r) => !!r.quiet === quiet);
    const web = mine.filter((r) => r.platform === "web").map((r) => r.token);
    const android = mine.filter((r) => r.platform === "android").map((r) => r.token);
    if (web.length) {
      messages.push({
        tokens: web,
        notification: { title: push.title, body: push.body },
        // Our service worker draws the notification, so it reads the flag from data.
        data: quiet ? { ...push.data, quiet: "1" } : push.data,
        ...(quiet && { webpush: { notification: { silent: true } } }),
      });
    }
    if (android.length) messages.push({ tokens: android, data: { ...push.data, body: push.body, ...(quiet && { quiet: "1" }) }, android: { priority: "high" } });
  }
  return messages;
}

export function fcmNotifier(db: Db, app: FirebaseApp, log: (msg: string) => void = console.error): Notifier {
  const messaging = getMessaging(app);
  return {
    async send(userIds, push) {
      if (userIds.length === 0) return;
      const rows = await db
        .select({ token: devices.token, platform: devices.platform, quietStart: users.quietStart, quietEnd: users.quietEnd, timezone: users.timezone })
        .from(devices)
        .innerJoin(users, eq(users.id, devices.userId))
        .where(inArray(devices.userId, userIds));
      if (rows.length === 0) return;
      const now = new Date();
      const targets = rows.map((r) => ({
        token: r.token,
        platform: r.platform,
        quiet: !push.urgent && r.quietStart && r.quietEnd && r.timezone ? isQuiet({ start: r.quietStart, end: r.quietEnd, timezone: r.timezone }, now) : false,
      }));
      for (const message of fcmMessages(targets, push)) {
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
