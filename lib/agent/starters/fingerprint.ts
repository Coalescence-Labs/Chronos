import { createHash } from "node:crypto";
import { resolveDefaultBranch, type RepoHistory } from "@/lib/graph";

/**
 * Loaded-history fingerprint for starter cache invalidation.
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

export function buildStarterCacheMaterial(input: {
  owner: string;
  repo: string;
  workosUserId: string;
  history: RepoHistory;
  defaultBranch?: string;
  now?: Date;
}): { fingerprint: string; dayKey: string; material: string; snapshotHash: string } {
  const fingerprint = buildStarterHistoryFingerprint(input.history, input.defaultBranch);
  const dayKey = starterDayKey(input.now);
  const material = [
    `${input.owner.trim()}/${input.repo.trim()}`,
    input.workosUserId.trim(),
    dayKey,
    fingerprint,
  ].join("\0");
  const snapshotHash = createHash("sha256").update(material).digest("hex").slice(0, 32);
  return { fingerprint, dayKey, material, snapshotHash };
}
