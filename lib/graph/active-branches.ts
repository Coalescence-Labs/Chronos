import { resolveDefaultBranch } from "./glance";
import type { GraphLayout } from "./layout";
import { branchPriority } from "./lines";
import { reachableFrom } from "./reachability";
import type { CommitNode, RepoHistory } from "./types";

/**
 * Ranked catalog of *active* live branches for the Glance rail.
 *
 * Active = the resolved default branch, plus every other live branch tip that
 * is not reachable from default (still open / unmerged). Merged tips and
 * merge-message recoveries are omitted — the rail is the live set, not history.
 *
 * Order is stable: trunk → staging → other, then tip row (newer first), then
 * name. Pure — no DOM, no network.
 */

/** Show the full rail when the active set fits; beyond this, tip labels only. */
export const ACTIVE_BRANCH_RAIL_CAP = 25;

export type ActiveBranchKind = "default" | "staging" | "open";

export interface ActiveBranch {
  name: string;
  tipSha: string;
  tipRow: number;
  lane: number;
  kind: ActiveBranchKind;
  /** branchPriority tier — exposed for tests / UI emphasis. */
  priority: number;
}

function isStagingName(name: string): boolean {
  return branchPriority(name) === 1;
}

function kindFor(name: string, isDefault: boolean): ActiveBranchKind {
  if (isDefault) return "default";
  if (isStagingName(name)) return "staging";
  return "open";
}

/**
 * Live active branches with drawable tips, ranked for a stable rail.
 * Branches whose tips are not in `layout` are skipped (can't jump/trace).
 */
export function listActiveBranches(
  history: RepoHistory,
  layout: GraphLayout,
  defaultBranch?: string,
): ActiveBranch[] {
  const placementBySha = new Map(layout.placements.map((placed) => [placed.sha, placed]));
  const bySha = new Map<string, CommitNode>();
  for (const commit of history.commits) {
    if (!bySha.has(commit.sha)) bySha.set(commit.sha, commit);
  }

  const resolved = resolveDefaultBranch(history, defaultBranch);
  const defaultTip = resolved?.tipSha;
  const defaultName = resolved?.name;
  const reachableDefault =
    defaultTip && bySha.has(defaultTip) ? reachableFrom([defaultTip], bySha) : new Set<string>();

  const seen = new Set<string>();
  const active: ActiveBranch[] = [];

  for (const ref of history.refs) {
    if (ref.type !== "branch") continue;
    if (seen.has(ref.name)) continue;
    const placed = placementBySha.get(ref.sha);
    if (!placed) continue;

    const isDefault =
      (defaultName !== undefined && ref.name === defaultName) ||
      (defaultName === undefined && defaultTip !== undefined && ref.sha === defaultTip);

    // Active: default always; others only while their tip sits outside default.
    if (!isDefault && reachableDefault.has(ref.sha)) continue;

    seen.add(ref.name);
    active.push({
      name: ref.name,
      tipSha: ref.sha,
      tipRow: placed.row,
      lane: placed.lane,
      kind: kindFor(ref.name, isDefault),
      priority: branchPriority(ref.name),
    });
  }

  return active.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.tipRow !== b.tipRow) return a.tipRow - b.tipRow;
    return a.name.localeCompare(b.name);
  });
}

/** True when the catalog fits the rail budget (owner: ~≤25). */
export function shouldShowActiveBranchRail(branches: readonly ActiveBranch[]): boolean {
  return branches.length > 0 && branches.length <= ACTIVE_BRANCH_RAIL_CAP;
}
