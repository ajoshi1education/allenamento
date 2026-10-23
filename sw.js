// Offline support: precache the app and content; network-first for content so updates arrive.
const VERSION = "dev";
const PRECACHE = [];
const CACHE = "allenamento-" + VERSION;

self.addEventListener("install", e => {
  // Fetch each file fresh (bypassing the browser cache and, via ?v=, the CDN cache) so a new
  // version never stores an old copy of a file.
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(PRECACHE.map(async u => {
    const r = await fetch(u + (u.includes("?") ? "&" : "?") + "v=" + VERSION, { cache: "reload" });
    if (!r.ok) throw new Error("precache failed: " + u);
    await c.put(u, r);
  }))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  const networkFirst = url.pathname.includes("/content/");
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (networkFirst) {
      try { const r = await fetch(e.request); if (r.ok) cache.put(e.request, r.clone()); return r; }
      catch { return (await cache.match(e.request, { ignoreSearch: true })) || Response.error(); }
    }
    const hit = await cache.match(e.request, { ignoreSearch: true });
    if (hit) return hit;
    const r = await fetch(e.request);
    if (r.ok) cache.put(e.request, r.clone());
    return r;
  })());
});
