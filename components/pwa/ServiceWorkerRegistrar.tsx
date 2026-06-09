"use client";

import { useEffect } from "react";

/**
 * Registers the offline app-shell service worker (public/sw.js) in
 * production. The worker caches static shell assets only — never /api
 * responses, which must stay transient (docs/PRIVACY.md).
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Install is best-effort; the app works without it.
    });
  }, []);
  return null;
}
