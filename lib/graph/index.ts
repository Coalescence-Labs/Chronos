/**
 * Pure graph layout over the normalized model. No DOM, no network, no
 * framework imports — enforced by lint rule and tests/boundaries.test.ts.
 */

export {
  DEFAULT_MAX_LANES,
  layoutGraph,
} from "./layout";
export type {
  EdgeKind,
  GraphEdge,
  GraphLayout,
  LayoutOptions,
  OpenEdge,
  PlacedCommit,
} from "./layout";
export type { CommitNode, Ref, RefType, RepoHistory } from "./types";
