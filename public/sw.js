// Traxora AI — Service Worker
const CACHE = "traxora-v2";
const STATIC = ["/", "/offline.html", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => clients.claim())
  );
});

// Required for PWA install prompt — network first, cache fallback
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (!url.origin.includes(self.location.hostname)) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((cached) => cached || caches.match("/offline.html")))
  );
});

// Push notifications
self.addEventListener("push", (e) => {
  if (!e.data) return;
  const data = e.data.json();
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag || "traxora-signal",
      data: { url: data.url || "/dashboard" },
      vibrate: [200, 100, 200],
      requireInteraction: true,
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const targetUrl = e.notification.data?.url || "/dashboard";
  e.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        return clients.openWindow(targetUrl);
      })
  );
});
