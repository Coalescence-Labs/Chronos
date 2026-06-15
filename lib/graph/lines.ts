import type { GraphLayout } from "./layout";
import type { CommitNode, RepoHistory } from "./types";

/**
 * Branch-line attribution: which commits belong to which named branch. Lanes
 * can't answer this (they're reused after merges free them), so we walk
 * first-parent chains down from each named tip, claiming commits until we
 * hit one already claimed by a higher-priority branch — the claim boundary
 * is exactly the fork point.
 *
 * Two sources of names:
 * - live refs (priority: main/master/trunk, then develop, then the rest)
 * - merged branches, whose only surviving record is the merge-commit
 *   message ("Merge branch 'x'", "Merge pull request #1 from owner/x", …)
 *
 * Pure — no DOM, no network (tests/boundaries.test.ts).
 */

export interface BranchLine {
  name: string;
  /** Live ref, or a name recovered from a merge-commit message. */
  source: "ref" | "merge";
  /** The labeled tip commit of this line. */
  tipSha: string;
  tipRow: number;
  /** Deepest row attributed to this line (its fork point is the row below). */
  lastRow: number;
  /** Lane of the tip commit — the line's visual column. */
  lane: number;
}

const MERGE_NAME_PATTERNS: RegExp[] = [
  /^Merge branch '([^']+)'/,
  /^Merge remote-tracking branch '(?:origin\/)?([^']+)'/,
  /^Merge pull request #\d+ from (\S+)/,
  /^Merge (\S+) (?:back )?into \S+/,
];

/** Recovers the merged branch's name from a merge-commit subject, if any. */
export function mergedBranchName(message: string): string | undefined {
  for (const [index, pattern] of MERGE_NAME_PATTERNS.entries()) {
    const match = message.match(pattern);
    if (!match) continue;
    const raw = match[1]!;
    // Pull-request refs arrive as owner/branch — drop the owner segment.
    if (index === 2) return raw.split("/").slice(1).join("/") || raw;
    return raw;
  }
  return undefined;
}

function refRank(name: string): number {
  const base = name.toLowerCase();
  if (base === "main" || base === "master" || base === "trunk") return 0;
  if (base === "develop" || base === "dev" || base === "development") return 1;
  return 2;
}

export interface BranchAttribution {
  /** All named lines, sorted by tip row. */
  lines: BranchLine[];
  /** The owning line for every commit a line claimed (trace/highlight key). */
  lineBySha: Map<string, BranchLine>;
}

export function attributeBranches(history: RepoHistory, layout: GraphLayout): BranchAttribution {
  const placementBySha = new Map(layout.placements.map((placed) => [placed.sha, placed]));
  const commitBySha = new Map<string, CommitNode>();
  for (const commit of history.commits) {
    if (!commitBySha.has(commit.sha)) commitBySha.set(commit.sha, commit);
  }

  const lineBySha = new Map<string, BranchLine>();
  const lines: BranchLine[] = [];

  const claim = (name: string, source: BranchLine["source"], tipSha: string) => {
    const tip = placementBySha.get(tipSha);
    if (!tip || lineBySha.has(tipSha)) return;
    const line: BranchLine = {
      name,
      source,
      tipSha,
      tipRow: tip.row,
      lastRow: tip.row,
      lane: tip.lane,
    };
    let sha: string | undefined = tipSha;
    while (sha !== undefined && placementBySha.has(sha) && !lineBySha.has(sha)) {
      lineBySha.set(sha, line);
      line.lastRow = placementBySha.get(sha)!.row;
      sha = commitBySha.get(sha)?.parents[0];
    }
    lines.push(line);
  };

  // Live refs claim first; trunk before develop before everything else, so
  // shared history always belongs to the longer-lived branch.
  const branchRefs = [...history.refs.filter((ref) => ref.type === "branch")].sort(
    (a, b) => refRank(a.name) - refRank(b.name),
  );
  for (const ref of branchRefs) claim(ref.name, "ref", ref.sha);

  // Historical branches: the merge commit's second parent is the merged
  // branch's tip. Newest merges claim first (placements are row-ordered).
  for (const placed of layout.placements) {
    const commit = commitBySha.get(placed.sha);
    if (!commit || commit.parents.length < 2) continue;
    const name = mergedBranchName(commit.message);
    if (name) claim(name, "merge", commit.parents[1]!);
  }

  return { lines: lines.sort((a, b) => a.tipRow - b.tipRow), lineBySha };
}

export function branchLines(history: RepoHistory, layout: GraphLayout): BranchLine[] {
  return attributeBranches(history, layout).lines;
}

/**
 * Lines whose labeled tip has scrolled above the viewport while the line
 * itself still reaches the top edge — these need a pinned badge (sticky
 * badges, variant B). `topRow` is fractional: scrollTop / rowHeight.
 */
export function pinnedLines(lines: BranchLine[], topRow: number): BranchLine[] {
  return lines.filter((line) => line.tipRow + 1 <= topRow && line.lastRow + 0.5 >= topRow);
}

/**
 * Greedy shelf packing for pinned badges: each item (sorted by start) goes
 * on the first shelf whose right edge clears it. Returns a shelf index per
 * item, or -1 when every shelf is occupied (badge dropped, not overlapped).
 */
export function packShelves(
  items: { start: number; width: number }[],
  options: { gap?: number; maxShelves?: number } = {},
): number[] {
  const gap = options.gap ?? 4;
  const maxShelves = options.maxShelves ?? 3;
  const rightEdges: number[] = [];
  return items.map(({ start, width }) => {
    for (let shelf = 0; shelf < maxShelves; shelf++) {
      if ((rightEdges[shelf] ?? Number.NEGATIVE_INFINITY) + gap <= start) {
        rightEdges[shelf] = start + width;
        return shelf;
      }
    }
    return -1;
  });
}
