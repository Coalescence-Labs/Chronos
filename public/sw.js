/*
 * Chronos offline app shell.
 *
 * Privacy (docs/PRIVACY.md): this worker caches the STATIC SHELL ONLY.
 * /api responses carry transient repo data and are never cached — caching
 * them would create a durable client-side store before decision #6
 * (COA-74) defines what, if anything, may be cached.
 */

const CACHE = "chronos-shell-v1";
const SHELL_PATHS = ["/", "/manifest.webmanifest"];
const STATIC_PREFIXES = ["/_next/static/", "/icons/", "/fonts/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL_PATHS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function isCacheable(url) {
  if (url.pathname.startsWith("/api/")) return false;
  return (
    SHELL_PATHS.includes(url.pathname) ||
    STATIC_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
  );
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  if (!isCacheable(url)) return; // network-only: includes every /api route

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fresh = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached ?? fresh;
    }),
  );
});
