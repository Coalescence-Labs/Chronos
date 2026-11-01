/**
 * Chronos Agent gen-UI — typed answer parts for Graph Q&A.
 *
 * Concept A: keep the glass Agent dock; answers compose from a small registry
 * of intentional primitives (not free HTML). The orchestrator or a structured
 * schema emits a sequence of parts; React renders via the registry.
 */

export const AGENT_GEN_UI_PART_TYPES = [
  "text",
  "commit",
  "branch",
  "tag",
  "release_note",
  "date",
  "list",
  "parents",
] as const;

export type AgentGenUiPartType = (typeof AGENT_GEN_UI_PART_TYPES)[number];

/** Short prose run — the glue between typed entities. */
export interface AgentTextPart {
  type: "text";
  text: string;
}

/**
 * Commit hash — secondary to refs. Prefer full sha; display may shorten.
 * UI treats these as muted (tooltip / long-press copy), not list decoration.
 */
export interface AgentCommitPart {
  type: "commit";
  sha: string;
  /** Optional short label (e.g. 7-char); defaults to sha.slice(0, 7). */
  label?: string;
}

/** Live or recovered branch name — visual language matches graph ref badges. */
export interface AgentBranchPart {
  type: "branch";
  name: string;
  tipSha?: string;
}

/** Annotated tag / release ref. */
export interface AgentTagPart {
  type: "tag";
  name: string;
  sha?: string;
}

/** Short release-note claim (title + optional body). */
export interface AgentReleaseNotePart {
  type: "release_note";
  title: string;
  body?: string;
}

/** Calendar / commit date — own primitive so dates stay scannable, not prose soup. */
export interface AgentDatePart {
  type: "date";
  /** ISO-8601 when known; otherwise a sanitized display label only. */
  iso?: string;
  label?: string;
}

/**
 * Bulleted group. Each item is an inline sequence of parts (text + entities),
 * so a row can read as "branch + commit" without nested HTML.
 */
export interface AgentListPart {
  type: "list";
  items: AgentGenUiInlinePart[][];
}

/** Parent SHAs for a merge / ancestry answer. */
export interface AgentParentsPart {
  type: "parents";
  shas: string[];
}

/** Inline-safe parts (may appear inside list items). */
export type AgentGenUiInlinePart =
  | AgentTextPart
  | AgentCommitPart
  | AgentBranchPart
  | AgentTagPart
  | AgentDatePart
  | AgentParentsPart;

/** Block-level answer sequence. */
export type AgentGenUiPart = AgentGenUiInlinePart | AgentListPart | AgentReleaseNotePart;

/** Soft GraphView lens targets derived from an answer. */
export interface AgentLensTargets {
  shas: string[];
  branches: string[];
}
