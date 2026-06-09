/**
 * Pure graph layout over the normalized model. No DOM, no network, no
 * framework imports — enforced by lint rule and tests/boundaries.test.ts.
 */

import type { RepoHistory } from "./types";

export type { CommitNode, Ref, RefType, RepoHistory } from "./types";

export interface PlacedCommit {
  sha: string;
  /** Vertical position, 0 = newest. */
  row: number;
  /** Horizontal lane (column). */
  lane: number;
}

export interface GraphLayout {
  placements: PlacedCommit[];
  laneCount: number;
}

/**
 * Placeholder layout: one commit per row, single lane. The real hybrid
 * lane-assignment algorithm (decision #1, docs/ARCHITECTURE.md) is COA-71.
 */
export function layoutGraph(history: RepoHistory): GraphLayout {
  const placements = history.commits.map((commit, row) => ({
    sha: commit.sha,
    row,
    lane: 0,
  }));
  return { placements, laneCount: placements.length > 0 ? 1 : 0 };
}
