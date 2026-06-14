import { layoutGraph } from "./layout";
import { branchLines } from "./lines";
import type { CommitNode, RepoHistory } from "./types";

/**
 * Glance mode (COA-75): two noise-reducing transforms over the normalized
 * model, applied *before* layout so the rest of the pipeline is unchanged.
 * Pure — no DOM, no network (tests/boundaries.test.ts).
 *
 * A) hideMergedIntoDefault — branches already merged into the default branch
 *    are removed from the surface: their exclusive side commits are dropped
 *    and the trunk's first-parent spine remains. Merge commits stay but,
 *    with their merged parent gone, read as plain trunk nodes (no lane/label
 *    emphasis). [Interpretation ratified by the owner: "remove side commits".]
 *
 * B) collapseMergedIntoNonDefault — a feature merged into a non-default branch
 *    (e.g. develop) but not yet into default is collapsed to a single capsule
 *    node (its real tip is kept, so selection/inspection still work), staying
 *    visible until it lands in default.
 *
 * If the default branch can't be identified, glance is a no-op (applied=false).
 */

export interface GlanceFlags {
  hideMergedIntoDefault: boolean;
  collapseMergedIntoNonDefault: boolean;
}

export interface Capsule {
  /** The real tip commit kept as the collapsed node. */
  tipSha: string;
  /** Branch name (live ref or recovered from a merge message), if known. */
  name?: string;
  /** How many commits the capsule stands in for. */
  commitCount: number;
}

export interface GlanceResult {
  history: RepoHistory;
  /** Capsule metadata keyed by tip sha, for distinct rendering. */
  capsules: Map<string, Capsule>;
  /** False when no default branch could be identified — nothing changed. */
  applied: boolean;
}

const GLANCE_OFF: GlanceFlags = {
  hideMergedIntoDefault: false,
  collapseMergedIntoNonDefault: false,
};

function isDefaultName(name: string): boolean {
  const base = name.toLowerCase();
  return base === "main" || base === "master" || base === "trunk";
}

/** The default branch tip: a main/master/trunk ref, else HEAD's target. */
function defaultTipSha(history: RepoHistory): string | undefined {
  const named = history.refs.find(
    (ref) => ref.type === "branch" && isDefaultName(ref.name),
  );
  if (named) return named.sha;
  return history.refs.find((ref) => ref.type === "head")?.sha;
}

/** All commits reachable from a tip by walking every parent link. */
function reachableFrom(tipSha: string, bySha: Map<string, CommitNode>): Set<string> {
  const seen = new Set<string>();
  const stack = [tipSha];
  while (stack.length > 0) {
    const sha = stack.pop()!;
    if (seen.has(sha) || !bySha.has(sha)) continue;
    seen.add(sha);
    for (const parent of bySha.get(sha)!.parents) stack.push(parent);
  }
  return seen;
}

/** First-parent chain from a tip — the branch's own spine. */
function firstParentChain(tipSha: string, bySha: Map<string, CommitNode>): Set<string> {
  const chain = new Set<string>();
  let sha: string | undefined = tipSha;
  while (sha !== undefined && bySha.has(sha) && !chain.has(sha)) {
    chain.add(sha);
    sha = bySha.get(sha)!.parents[0];
  }
  return chain;
}

export function applyGlance(
  history: RepoHistory,
  flags: GlanceFlags = GLANCE_OFF,
): GlanceResult {
  const capsules = new Map<string, Capsule>();
  if (!flags.hideMergedIntoDefault && !flags.collapseMergedIntoNonDefault) {
    return { history, capsules, applied: false };
  }

  const bySha = new Map<string, CommitNode>();
  for (const commit of history.commits) {
    if (!bySha.has(commit.sha)) bySha.set(commit.sha, commit);
  }

  const defaultTip = defaultTipSha(history);
  if (defaultTip === undefined || !bySha.has(defaultTip)) {
    // Can't determine the default branch → feature is a no-op.
    return { history, capsules, applied: false };
  }

  const reachableDefault = reachableFrom(defaultTip, bySha);
  const defaultSpine = firstParentChain(defaultTip, bySha);

  // Open (unmerged) non-default branches: their tips aren't in default's
  // history. We protect their *first-parent spines* (their own trunks) from
  // hiding — not everything they reach, or an open develop that has merged
  // most of history would shield every already-landed feature.
  const openTips = new Set<string>();
  for (const ref of history.refs) {
    if (ref.type !== "branch" || isDefaultName(ref.name)) continue;
    if (bySha.has(ref.sha) && !reachableDefault.has(ref.sha)) openTips.add(ref.sha);
  }
  const openSpines = new Set<string>();
  for (const tip of openTips) {
    for (const sha of firstParentChain(tip, bySha)) openSpines.add(sha);
  }

  let commits = history.commits;

  // ── Feature A: drop commits exclusive to branches merged into default ──
  if (flags.hideMergedIntoDefault) {
    const hidden = new Set<string>();
    for (const sha of reachableDefault) {
      if (!defaultSpine.has(sha) && !openSpines.has(sha)) hidden.add(sha);
    }
    if (hidden.size > 0) {
      commits = commits
        .filter((commit) => !hidden.has(commit.sha))
        // Drop references to hidden parents so merge commits become clean
        // trunk nodes instead of dangling open-edge stubs.
        .map((commit) =>
          commit.parents.some((p) => hidden.has(p))
            ? { ...commit, parents: commit.parents.filter((p) => !hidden.has(p)) }
            : commit,
        );
    }
  }

  // ── Feature B: collapse features merged into a non-default branch ──
  if (flags.collapseMergedIntoNonDefault && openTips.size > 0) {
    const reduced: RepoHistory = { commits, refs: history.refs };
    const layout = layoutGraph(reduced);
    const rowOf = new Map(layout.placements.map((p) => [p.sha, p.row]));
    const lines = branchLines(reduced, layout);
    const reducedBySha = new Map(commits.map((c) => [c.sha, c]));
    const reachableOpen = new Set<string>();
    for (const tip of openTips) {
      if (reducedBySha.has(tip)) {
        for (const sha of reachableFrom(tip, reducedBySha)) reachableOpen.add(sha);
      }
    }

    const removed = new Set<string>();
    const rewire = new Map<string, string[]>(); // tipSha → new parents
    for (const line of lines) {
      // Collapse a line that is a feature staged on a non-default branch:
      // not the default, not itself an open branch tip, not yet in default,
      // but reachable from one — and long enough to be worth folding.
      if (
        isDefaultName(line.name) ||
        openTips.has(line.tipSha) ||
        reachableDefault.has(line.tipSha) ||
        !reachableOpen.has(line.tipSha)
      ) {
        continue;
      }
      // The line owns exactly its first-parent commits from tipRow down to
      // lastRow (branchLines' own boundary); the deepest one's first parent
      // is the fork point on the branch it merged into.
      const chain: string[] = [];
      let sha: string | undefined = line.tipSha;
      while (sha !== undefined && reducedBySha.has(sha) && !chain.includes(sha)) {
        chain.push(sha);
        if (rowOf.get(sha) === line.lastRow) break;
        sha = reducedBySha.get(sha)!.parents[0];
      }
      if (chain.length < 2) continue; // nothing to fold

      const forkParent = chooseForkParent(chain, reducedBySha, openTips, reachableDefault);
      for (const s of chain) if (s !== line.tipSha) removed.add(s);
      rewire.set(line.tipSha, forkParent ? [forkParent] : []);
      capsules.set(line.tipSha, {
        tipSha: line.tipSha,
        name: line.name,
        commitCount: chain.length,
      });
    }

    if (removed.size > 0 || rewire.size > 0) {
      commits = commits
        .filter((commit) => !removed.has(commit.sha))
        .map((commit) => {
          if (rewire.has(commit.sha)) return { ...commit, parents: rewire.get(commit.sha)! };
          if (commit.parents.some((p) => removed.has(p))) {
            return { ...commit, parents: commit.parents.filter((p) => !removed.has(p)) };
          }
          return commit;
        });
    }
  }

  return { history: { commits, refs: history.refs }, capsules, applied: true };
}

/**
 * The single parent the capsule attaches to. Candidates are the boundary
 * parents of the collapsed chain (parents outside it). Ticket rule: prefer a
 * commit on a non-default open branch, then smallest commit-distance to the
 * tip, then lexicographic by sha.
 */
function chooseForkParent(
  chain: string[],
  bySha: Map<string, CommitNode>,
  openTips: Set<string>,
  reachableDefault: Set<string>,
): string | undefined {
  const inChain = new Set(chain);
  const candidates: { sha: string; distance: number }[] = [];
  chain.forEach((sha, distance) => {
    for (const parent of bySha.get(sha)?.parents ?? []) {
      if (!inChain.has(parent) && bySha.has(parent)) candidates.push({ sha: parent, distance });
    }
  });
  if (candidates.length === 0) return undefined;
  const openSpine = new Set<string>();
  for (const tip of openTips) for (const s of firstParentChain(tip, bySha)) openSpine.add(s);
  candidates.sort((a, b) => {
    const aOpen = openSpine.has(a.sha) ? 0 : reachableDefault.has(a.sha) ? 1 : 2;
    const bOpen = openSpine.has(b.sha) ? 0 : reachableDefault.has(b.sha) ? 1 : 2;
    if (aOpen !== bOpen) return aOpen - bOpen; // (1) prefer the non-default branch
    if (a.distance !== b.distance) return a.distance - b.distance; // (2) nearest
    return a.sha < b.sha ? -1 : 1; // (3) lexicographic
  });
  return candidates[0]!.sha;
}
