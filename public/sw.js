/*
 * Chronos offline app shell.
 *
 * Privacy (docs/PRIVACY.md): this worker caches the STATIC SHELL ONLY.
 * /api responses carry transient repo data and are never cached — caching
 * them would create a durable client-side store before decision #6
 * (COA-74) defines what, if anything, may be cached. /repo/* navigations are
 * likewise never cached, so a cache key can never reveal which repo was viewed.
 *
 * Strategy:
 *  - Shell documents ("/", manifest): NETWORK-FIRST. The HTML is not
 *    content-hashed and embeds hashed /_next/static chunk URLs; serving a
 *    stale cached shell would pin dead chunk references after a deploy and
 *    break hydration. Online always wins; the cache is the offline fallback.
 *  - Hashed static assets (/_next/static, icons, fonts): CACHE-FIRST. Their
 *    names are immutable, so a cached copy is always correct and fast.
 */

const CACHE = "chronos-shell-v2";
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
  // Drop older shell caches (e.g. v1, which cache-firsted the HTML) so
  // returning clients self-heal on their next load.
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function cachePut(request, response) {
  if (response.ok) {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(request, copy));
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // never cache transient repo data

  const isStatic = STATIC_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
  const isShell = SHELL_PATHS.includes(url.pathname);
  if (!isStatic && !isShell) return; // network-only: includes /repo/*, /demo, etc.

  if (isStatic) {
    // Immutable content-hashed assets: cache-first, refresh in the background.
    event.respondWith(
      caches.match(event.request).then(
        (cached) => cached ?? fetch(event.request).then((res) => cachePut(event.request, res)),
      ),
    );
    return;
  }

  // Shell document: network-first so fresh HTML (with current chunk refs)
  // always wins online; fall back to the cached shell only when offline.
  event.respondWith(
    fetch(event.request)
      .then((res) => cachePut(event.request, res))
      .catch(() => caches.match(event.request)),
  );
});
