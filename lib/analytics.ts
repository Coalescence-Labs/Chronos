/**
 * Analytics chokepoint (COA-96, see docs/ANALYTICS.md).
 *
 * Every analytics path goes through this module so the privacy posture is
 * auditable in one place. v1 covers the page-view *scrubbing* control and the
 * kill switch; custom events (the typed `track()` allowlist) arrive in COA-97.
 *
 * Privacy: page-view events carry the URL, and Chronos' graph route is
 * `/repo/[owner]/[repo]` — the raw path would tell Vercel *which* repo a
 * visitor viewed (docs/PRIVACY.md forbids that). `scrubUrl` rewrites every
 * path to a fixed route template and drops query/hash before anything is sent.
 */

/** Self-host / opt-out kill switch. Analytics is on unless explicitly disabled. */
export const ANALYTICS_ENABLED = process.env.NEXT_PUBLIC_ANALYTICS_ENABLED !== "false";

/**
 * Map a concrete page URL to a known route template, discarding owner/repo
 * segments and all query/hash. Allowlist, not denylist: an unrecognized path
 * returns `null` (the event is dropped) so a new route can never silently leak
 * a repo identifier.
 */
export function scrubUrl(rawUrl: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(rawUrl, "http://localhost").pathname;
  } catch {
    return null; // unparseable → fail closed
  }
  if (pathname === "/") return "/";
  if (/^\/repo\/[^/]+\/[^/]+/.test(pathname)) return "/repo/[owner]/[repo]";
  if (pathname === "/demo" || pathname.startsWith("/demo/")) return "/demo";
  if (pathname === "/styleguide" || pathname.startsWith("/styleguide/")) return "/styleguide";
  return null;
}
