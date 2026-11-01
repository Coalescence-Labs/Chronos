import { resolveDefaultBranch, type RepoHistory } from "@/lib/graph";

/**
 * Loaded-history fingerprint for starter cache invalidation. Shared with the
 * browser cache (`client-cache.ts`), so nothing server-only belongs here.
 *
 * Choice (documented):
 * - **Branch tip SHAs** — unique `ref.sha` for `type === "branch"`, sorted
 *   lexicographically. Captures tip-set movement without hashing every commit.
 * - **Commit count** — loaded slice size (`history.commits.length`).
 * - **Default branch name** — `resolveDefaultBranch` result (or `"default"`).
 *
 * Combined with owner/repo, WorkOS user id, and calendar day (d-m-y) in the
 * Redis key so starters refresh daily and when tips or load size change.
 */
export function buildStarterHistoryFingerprint(
  history: RepoHistory,
  defaultBranch?: string,
): string {
  const tipShas = [
    ...new Set(
      history.refs.filter((ref) => ref.type === "branch").map((ref) => ref.sha),
    ),
  ].sort();
  const resolved = resolveDefaultBranch(history, defaultBranch);
  const defaultName = resolved?.name ?? "default";
  return `tips=${tipShas.join(",")}|count=${history.commits.length}|default=${defaultName}`;
}

/** Calendar day key as day-month-year (UTC), e.g. `22-10-2026`. */
export function starterDayKey(date = new Date()): string {
  const day = date.getUTCDate();
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();
  return `${day}-${month}-${year}`;
}
