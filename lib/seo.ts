import type { Metadata } from "next";

/**
 * Per-route metadata helpers (COA-126), kept pure and component-free so the
 * privacy-critical indexing rules are unit-testable in isolation.
 */

/**
 * Metadata for the dynamic `/repo/[owner]/[repo]` route.
 *
 * The `owner/repo` title is for the user's own tab/history only. The page is
 * **noindex, nofollow** — privacy (never index which repo someone viewed) and
 * budget (keep crawlers from triggering BFF→GitHub calls; docs/PRIVACY.md,
 * COA-74). It sets **no** `openGraph`/`twitter`, so it inherits the generic
 * root card and never shares a repo identifier in a link preview.
 */
export function repoMetadata(owner: string, repo: string): Metadata {
  return {
    title: `${owner}/${repo}`,
    robots: { index: false, follow: false },
  };
}
