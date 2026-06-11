import type { CommitNode, Ref, RepoHistory } from "@/lib/graph";

/**
 * Normalized-model fixtures for layout tests: deterministic shas and
 * descending author dates (index 0 = newest), mirroring what ingestion
 * produces.
 */

const BASE_TIME = Date.parse("2026-06-01T12:00:00Z");

export function commit(
  sha: string,
  parents: string[],
  minutesAgo: number,
  author = "ada",
): CommitNode {
  return {
    sha,
    parents,
    author,
    date: new Date(BASE_TIME - minutesAgo * 60_000).toISOString(),
    message: `change ${sha}`,
  };
}

export function withHead(commits: CommitNode[], headSha?: string): RepoHistory {
  const tip = headSha ?? commits[0]?.sha;
  const refs: Ref[] = tip
    ? [
        { name: "HEAD", type: "head", sha: tip },
        { name: "main", type: "branch", sha: tip },
      ]
    : [];
  return { commits, refs };
}

/** c0 (newest) ← c1 ← … ← c(count-1) (root). */
export function linear(count: number): RepoHistory {
  const commits = Array.from({ length: count }, (_, i) =>
    commit(`c${i}`, i === count - 1 ? [] : [`c${i + 1}`], i),
  );
  return withHead(commits);
}

/**
 * A trunk where every commit merges a one-commit feature branch that forked
 * `span` trunk commits earlier — so `span` branches are in flight at any
 * row. Total commits: 2 * mergeCount + span + 1.
 */
export function heavyMerge(mergeCount: number, span = 4): RepoHistory {
  const commits: CommitNode[] = [];
  const trunkLength = mergeCount + span + 1;
  for (let i = 0; i < trunkLength; i++) {
    const parents = i === trunkLength - 1 ? [] : [`t${i + 1}`];
    if (i < mergeCount) parents.push(`f${i}`);
    commits.push(commit(`t${i}`, parents, i * 2));
    if (i < mergeCount) commits.push(commit(`f${i}`, [`t${i + span}`], i * 2 + 1));
  }
  return withHead(commits, "t0");
}
