/**
 * Canonical site origin — the single source of truth for absolute URLs in
 * metadata (metadataBase, canonicals, OG/Twitter, robots, sitemap).
 *
 * Defaults to the production domain; override with NEXT_PUBLIC_SITE_URL for
 * other environments. Always trailing-slash-trimmed so `${SITE_URL}/path`
 * composes cleanly.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://chronos.coalescencelabs.app"
).replace(/\/+$/, "");

/** Shared marketing copy, reused across metadata + the OG card. */
export const SITE_NAME = "Chronos";
export const SITE_TAGLINE = "See your git history at a glance.";
export const SITE_DESCRIPTION =
  "A beautiful, fast git branch-graph visualizer. High information density, low cognitive load.";
