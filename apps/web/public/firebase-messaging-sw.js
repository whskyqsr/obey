/* Obey web push service worker.
 *
 * Firebase Cloud Messaging delivers Web Push messages to this worker. We handle the standard
 * `push` event ourselves instead of importing the Firebase SDK, so the worker has no CDN
 * dependency. The app passes this registration to `getToken({ serviceWorkerRegistration })`.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { notification: { body: event.data ? event.data.text() : "" } };
  }
  const n = payload.notification || {};
  const data = payload.data || {};
  const title = n.title || data.title || "Obey";
  const options = {
    body: n.body || data.body || "",
    icon: n.icon || "/icon.svg",
    badge: "/icon.svg",
    tag: data.tag || payload.fcmMessageId || undefined,
    data: { url: data.url || (payload.fcmOptions && payload.fcmOptions.link) || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if ("focus" in w) {
          w.navigate(url).catch(() => {});
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
