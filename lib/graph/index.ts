/**
 * Pure graph layout over the normalized model. No DOM, no network, no
 * framework imports — enforced by lint rule and tests/boundaries.test.ts.
 */

export {
  DEFAULT_MAX_LANES,
  layoutGraph,
} from "./layout";
export {
  attributeBranches,
  branchLines,
  mergedBranchName,
  packShelves,
  pinnedLines,
} from "./lines";
export type { BranchAttribution, BranchLine } from "./lines";
export { applyGlance } from "./glance";
export type { Capsule, GlanceFlags, GlanceResult } from "./glance";
export {
  commitIndex,
  pruneUnreachable,
  reachableFrom,
  reachableFromRefs,
} from "./reachability";
export type { PruneResult } from "./reachability";
export type {
  EdgeKind,
  GraphEdge,
  GraphLayout,
  LayoutOptions,
  OpenEdge,
  PlacedCommit,
} from "./layout";
export type { CommitNode, Ref, RefType, RepoHistory } from "./types";
