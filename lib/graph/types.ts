/**
 * The normalized git model — the contract between ingestion (lib/ingest)
 * and layout (this module). Sources vary (public URL, GitHub OAuth, local
 * .git in phase 2); this model does not. Keep it source-agnostic.
 *
 * Fields are the graph-relevant minimum per docs/PRIVACY.md: sha, parents,
 * author, date, message, refs. No file contents, no diffs.
 */

export interface CommitNode {
  sha: string;
  /** Parent shas, first parent first. Length 0 = root, >1 = merge. */
  parents: string[];
  author: string;
  /** ISO 8601 author date. */
  date: string;
  /** First line of the commit message. */
  message: string;
}

export type RefType = "branch" | "tag" | "head";

export interface Ref {
  name: string;
  type: RefType;
  sha: string;
}

export interface RepoHistory {
  /** Commits in reverse-chronological topological order (newest first). */
  commits: CommitNode[];
  refs: Ref[];
}
