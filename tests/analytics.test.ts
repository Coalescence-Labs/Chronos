import { describe, expect, test } from "bun:test";
import {
  ANALYTICS_ENABLED,
  analyticsPayload,
  layoutMsBucket,
  msBucket,
  scrubUrl,
  sizeBucket,
} from "@/lib/analytics";
import type { AnalyticsEvent } from "@/lib/analytics";

/**
 * Analytics URL scrubbing (COA-96). The whole privacy claim — "analytics
 * never records which repo you viewed" — rests on this function, so it's
 * tested as an allowlist that fails closed.
 */

describe("scrubUrl", () => {
  test("collapses the repo route to its template — owner/repo never leave", () => {
    expect(scrubUrl("https://chronos.app/repo/torvalds/linux")).toBe("/repo/[owner]/[repo]");
    expect(scrubUrl("https://chronos.app/repo/facebook/react/")).toBe("/repo/[owner]/[repo]");
    // Deeper segments and any query/hash are discarded with the template.
    expect(scrubUrl("https://chronos.app/repo/a/b/tree/main?x=1#frag")).toBe(
      "/repo/[owner]/[repo]",
    );
  });

  test("keeps the known static routes as-is", () => {
    expect(scrubUrl("https://chronos.app/")).toBe("/");
    expect(scrubUrl("https://chronos.app/demo")).toBe("/demo");
    expect(scrubUrl("https://chronos.app/demo?ref=x")).toBe("/demo");
    expect(scrubUrl("https://chronos.app/styleguide")).toBe("/styleguide");
  });

  test("drops query and hash from every reported URL", () => {
    expect(scrubUrl("https://chronos.app/?utm=newsletter")).toBe("/");
    expect(scrubUrl("https://chronos.app/#section")).toBe("/");
  });

  test("fails closed: an unrecognized path is dropped (null), never sent verbatim", () => {
    expect(scrubUrl("https://chronos.app/secret/path")).toBeNull();
    expect(scrubUrl("https://chronos.app/repo/only-owner")).toBeNull(); // not a full repo route
    expect(scrubUrl("not a url")).toBeNull();
  });

  test("is enabled by default (kill switch is opt-out)", () => {
    // NEXT_PUBLIC_ANALYTICS_ENABLED is unset in tests → enabled.
    expect(ANALYTICS_ENABLED).toBe(true);
  });
});

/**
 * Custom-event privacy contract (COA-97). Every payload that can leave the
 * browser must carry only allowlisted, non-identifying primitives — no repo
 * names, SHAs, branch/tag names, authors, URLs, or any free text. The typed
 * union enforces this at compile time; these tests enforce it at runtime so a
 * future widening of the allowlist fails loudly.
 */
describe("analyticsPayload", () => {
  // One representative instance of every event in the union.
  const samples: AnalyticsEvent[] = [
    { name: "repo_submitted", props: { source: "url" } },
    { name: "render_result", props: { ok: true } },
    { name: "render_result", props: { ok: false, error: "rate-limited" } },
    { name: "lazy_page", props: { depth: 3 } },
    { name: "interaction", props: { kind: "trace" } },
    { name: "theme_change", props: { theme: "dark" } },
    { name: "graph_ready", props: { device: "laptop", ms_bucket: "lt_500" } },
    { name: "layout_cost", props: { ms_bucket: "5_20", size_bucket: "1k_10k" } },
    { name: "demo_view" },
    { name: "rate_limited" },
  ];

  test("emits only primitive prop values (string | number | boolean)", () => {
    for (const event of samples) {
      const { props } = analyticsPayload(event);
      for (const value of Object.values(props ?? {})) {
        expect(["string", "number", "boolean"]).toContain(typeof value);
      }
    }
  });

  test("drops undefined props (render_result without an error code)", () => {
    expect(analyticsPayload({ name: "render_result", props: { ok: true } })).toEqual({
      name: "render_result",
      props: { ok: true },
    });
  });

  test("propless events carry no props object", () => {
    expect(analyticsPayload({ name: "demo_view" })).toEqual({ name: "demo_view" });
    expect(analyticsPayload({ name: "rate_limited" })).toEqual({ name: "rate_limited" });
  });

  test("no prop value looks like a repo identifier (slug / sha / url / path)", () => {
    const identifierish = /\/|@|github\.com|^[0-9a-f]{7,40}$/i;
    for (const event of samples) {
      for (const value of Object.values(analyticsPayload(event).props ?? {})) {
        if (typeof value === "string") expect(value).not.toMatch(identifierish);
      }
    }
  });
});

/**
 * Perf bucketing (COA-98): durations and sizes are always coarsened to enums
 * before they reach `track()`, so no value precise enough to fingerprint a
 * repo (or a user's exact timing) ever leaves the browser.
 */
describe("perf buckets", () => {
  test("msBucket (time-to-first-graph) maps by boundary", () => {
    expect(msBucket(0)).toBe("lt_500");
    expect(msBucket(499)).toBe("lt_500");
    expect(msBucket(500)).toBe("500_1500");
    expect(msBucket(1499)).toBe("500_1500");
    expect(msBucket(1500)).toBe("1500_4000");
    expect(msBucket(3999)).toBe("1500_4000");
    expect(msBucket(4000)).toBe("gt_4000");
  });

  test("layoutMsBucket maps by boundary", () => {
    expect(layoutMsBucket(0)).toBe("lt_5");
    expect(layoutMsBucket(5)).toBe("5_20");
    expect(layoutMsBucket(20)).toBe("20_100");
    expect(layoutMsBucket(100)).toBe("100_500");
    expect(layoutMsBucket(500)).toBe("gt_500");
  });

  test("sizeBucket maps commit counts by boundary", () => {
    expect(sizeBucket(0)).toBe("lt_100");
    expect(sizeBucket(99)).toBe("lt_100");
    expect(sizeBucket(100)).toBe("100_1k");
    expect(sizeBucket(999)).toBe("100_1k");
    expect(sizeBucket(1_000)).toBe("1k_10k");
    expect(sizeBucket(9_999)).toBe("1k_10k");
    expect(sizeBucket(10_000)).toBe("gt_10k");
  });
});
