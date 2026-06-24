/**
 * Analytics chokepoint (COA-96/97, see docs/ANALYTICS.md).
 *
 * Every analytics path goes through this module so the privacy posture is
 * auditable in one place: page-view URL scrubbing (`scrubUrl`), the kill
 * switch (`ANALYTICS_ENABLED`), and the typed custom-event allowlist (`track`).
 * Components never import the Vercel SDK directly.
 *
 * Privacy: page-view events carry the URL, and Chronos' graph route is
 * `/repo/[owner]/[repo]` — the raw path would tell Vercel *which* repo a
 * visitor viewed (docs/PRIVACY.md forbids that). `scrubUrl` rewrites every
 * path to a fixed route template and drops query/hash before anything is sent.
 */

import { track as vercelTrack } from "@vercel/analytics";
import type { IngestErrorCode } from "@/lib/ingest/errors";

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

/* ── Custom events (COA-97) ─────────────────────────────────────────────────
 *
 * The discriminated union below IS the spec: it is the complete, typed
 * allowlist of what may be sent. Every prop is an enum, a boolean, or a count
 * — there is deliberately no event that accepts free text, so a repo name,
 * SHA, branch, author, or URL cannot be passed through `track()` even by
 * mistake (docs/PRIVACY.md §2). Durations/sizes are pre-bucketed to enums by
 * the caller before they ever reach here (COA-98).
 */

/** Where a repo view was initiated. `github` is reserved for the future link flow. */
export type RepoSource = "url" | "demo" | "github";
/** Progressive-depth affordances we want to know are discovered/used. */
export type InteractionKind = "glance" | "trace" | "inspect" | "peek";
export type ThemeChoice = "system" | "dark" | "light";
/** Coarse device class (no fingerprinting) — phone vs laptop perf differ. */
export type DeviceClass = "phone" | "laptop";
/** Time-to-first-graph buckets (ms): the "at a glance" latency promise. */
export type MsBucket = "lt_500" | "500_1500" | "1500_4000" | "gt_4000";
/** Layout-cost buckets (ms): finer, since layoutGraph is sub-frame work. */
export type LayoutMsBucket = "lt_5" | "5_20" | "20_100" | "100_500" | "gt_500";
/** Repo-size buckets (commit count) — always bucketed, never the exact size. */
export type SizeBucket = "lt_100" | "100_1k" | "1k_10k" | "gt_10k";

export type AnalyticsEvent =
  | { name: "repo_submitted"; props: { source: RepoSource } }
  | { name: "render_result"; props: { ok: boolean; error?: IngestErrorCode } }
  | { name: "lazy_page"; props: { depth: number } }
  | { name: "interaction"; props: { kind: InteractionKind } }
  | { name: "theme_change"; props: { theme: ThemeChoice } }
  // Performance (COA-98). Time-to-first-graph is bucketed by device, not size
  // — first paint is bounded by the first page, so it isn't size-dependent;
  // the size dimension lives on layout_cost instead, where it's meaningful.
  | { name: "graph_ready"; props: { device: DeviceClass; ms_bucket: MsBucket } }
  | { name: "layout_cost"; props: { ms_bucket: LayoutMsBucket; size_bucket: SizeBucket } }
  | { name: "demo_view" }
  | { name: "rate_limited" };

/** Bucket a time-to-first-graph duration (ms) to an enum — never the raw value. */
export function msBucket(ms: number): MsBucket {
  if (ms < 500) return "lt_500";
  if (ms < 1500) return "500_1500";
  if (ms < 4000) return "1500_4000";
  return "gt_4000";
}

/** Bucket a layout duration (ms) to an enum. */
export function layoutMsBucket(ms: number): LayoutMsBucket {
  if (ms < 5) return "lt_5";
  if (ms < 20) return "5_20";
  if (ms < 100) return "20_100";
  if (ms < 500) return "100_500";
  return "gt_500";
}

/** Bucket a commit count to an enum — coarse enough never to fingerprint a repo. */
export function sizeBucket(count: number): SizeBucket {
  if (count < 100) return "lt_100";
  if (count < 1_000) return "100_1k";
  if (count < 10_000) return "1k_10k";
  return "gt_10k";
}

type EventName = AnalyticsEvent["name"];
type VercelProps = Record<string, string | number | boolean>;

/**
 * Normalize an event to the `{ name, props }` Vercel expects, dropping any
 * `undefined` prop (Vercel only accepts string | number | boolean | null).
 * Pure and exported so the privacy contract is unit-testable without the SDK.
 */
export function analyticsPayload(
  event: AnalyticsEvent,
): { name: EventName; props?: VercelProps } {
  if (!("props" in event)) return { name: event.name };
  const props: VercelProps = {};
  for (const [key, value] of Object.entries(event.props)) {
    if (value !== undefined) props[key] = value as VercelProps[string];
  }
  return { name: event.name, props };
}

/** The single emit point for custom events. No-op when analytics is disabled. */
export function track(event: AnalyticsEvent): void {
  if (!ANALYTICS_ENABLED) return;
  const { name, props } = analyticsPayload(event);
  vercelTrack(name, props);
}
