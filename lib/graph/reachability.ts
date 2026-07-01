import type { CommitNode, RepoHistory } from "./types";

/**
 * Reachability over the loaded commit graph (COA-127). Pure — no DOM, no
 * network (tests/boundaries.test.ts).
 *
 * Parent links that point outside the loaded set (progressive-loading
 * truncation, open edges) are skipped, mirroring how layout treats them: the
 * walk covers exactly what the loaded graph can prove.
 */

/** Deduplicated sha → commit index for a commit list. */
export function commitIndex(commits: readonly CommitNode[]): Map<string, CommitNode> {
  const bySha = new Map<string, CommitNode>();
  for (const commit of commits) {
    if (!bySha.has(commit.sha)) bySha.set(commit.sha, commit);
  }
  return bySha;
}

/** All loaded commits reachable from any of the given tips via parent links. */
export function reachableFrom(
  tips: Iterable<string>,
  bySha: Map<string, CommitNode>,
): Set<string> {
  const seen = new Set<string>();
  const stack: string[] = [];
  for (const tip of tips) stack.push(tip);
  while (stack.length > 0) {
    const sha = stack.pop()!;
    if (seen.has(sha) || !bySha.has(sha)) continue;
    seen.add(sha);
    for (const parent of bySha.get(sha)!.parents) stack.push(parent);
  }
  return seen;
}

/** Every loaded commit reachable from any current ref (branch, tag, HEAD). */
export function reachableFromRefs(history: RepoHistory): Set<string> {
  return reachableFrom(
    history.refs.map((ref) => ref.sha),
    commitIndex(history.commits),
  );
}

export interface PruneResult {
  history: RepoHistory;
  /** How many loaded commits were dropped as unreachable. */
  pruned: number;
}

/**
 * Drop commits no ref can reach — the reconcile step that turns an additive
 * refresh into a correct one. Deleted branches, rebases, force-pushes, and
 * squash-merges all strand commits; a fresh load would never include them,
 * so neither should a refreshed view. Pruning is closed under parenthood
 * (a kept commit's loaded parents are reachable through it by definition),
 * so no kept commit ends up pointing at a pruned one.
 */
export function pruneUnreachable(history: RepoHistory): PruneResult {
  const reachable = reachableFromRefs(history);
  const commits = history.commits.filter((commit) => reachable.has(commit.sha));
  if (commits.length === history.commits.length) return { history, pruned: 0 };
  return {
    history: { commits, refs: history.refs },
    pruned: history.commits.length - commits.length,
  };
}
