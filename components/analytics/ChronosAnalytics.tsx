"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ANALYTICS_ENABLED, scrubUrl } from "@/lib/analytics";

/**
 * Mounts Vercel Web Analytics + Speed Insights with the privacy controls from
 * COA-96 (docs/ANALYTICS.md):
 * - `beforeSend` scrubs every page-view URL to its route template so repo
 *   owner/name in `/repo/[owner]/[repo]` never leaves the browser (and an
 *   unrecognized path is dropped entirely — fail closed).
 * - the whole thing is gated by the NEXT_PUBLIC_ANALYTICS_ENABLED kill switch.
 *
 * It's a client component because `beforeSend` is a function (can't cross the
 * server/client boundary) — so it lives here, not in the server layout.
 * Speed Insights reports the App Router route template, not the filled path.
 */
export function ChronosAnalytics() {
  if (!ANALYTICS_ENABLED) return null;
  return (
    <>
      <Analytics
        beforeSend={(event) => {
          const url = scrubUrl(event.url);
          return url === null ? null : { ...event, url };
        }}
      />
      <SpeedInsights />
    </>
  );
}
