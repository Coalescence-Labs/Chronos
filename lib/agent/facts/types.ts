import type { RepoHistory } from "@/lib/graph";
import type { AgentBranchFocus, AgentChatContextRef } from "@/lib/agent/chat-context";

/** Graph-anchored facts — authors omitted per Agent privacy posture. */
export interface CommitFact {
  sha: string;
  parents: string[];
  date: string;
  message: string;
  merge: boolean;
}

export interface RefFact {
  name: string;
  type: string;
  sha: string;
}

export interface GraphFactBundle {
  owner: string;
  repo: string;
  loadHandle: string;
  loadedCommits: number;
  loadedRefs: number;
  selectedSha?: string;
  commits: CommitFact[];
  refs: RefFact[];
}

export interface FactToolContext {
  owner: string;
  repo: string;
  history: RepoHistory;
  selectedSha?: string | null;
  focusedBranch?: AgentBranchFocus | null;
  contextRefs?: AgentChatContextRef[];
}
