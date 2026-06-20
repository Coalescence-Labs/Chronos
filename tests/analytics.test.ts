import { describe, expect, test } from "bun:test";
import { ANALYTICS_ENABLED, scrubUrl } from "@/lib/analytics";

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
