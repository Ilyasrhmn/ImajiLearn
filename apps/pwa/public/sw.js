/* Only the public offline fallback is cached. Private pages and APIs stay online. */
const CACHE = "imajilearn-offline-v1";
const FALLBACK = "/app/offline.html";
self.addEventListener("install", event => { event.waitUntil(caches.open(CACHE).then(cache => cache.add(FALLBACK))); });
self.addEventListener("activate", event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("imajilearn-offline-") && key !== CACHE).map(key => caches.delete(key))))); });
self.addEventListener("message", event => { if (event.data?.type === "ACTIVATE_UPDATE") self.skipWaiting(); });
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || event.request.mode !== "navigate" || url.origin !== self.location.origin || !url.pathname.startsWith("/app/")) return;
  event.respondWith(fetch(event.request).catch(async () => (await caches.open(CACHE)).match(FALLBACK)));
});
