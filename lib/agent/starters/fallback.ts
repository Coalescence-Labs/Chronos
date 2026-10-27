import { resolveDefaultBranch, type RepoHistory } from "@/lib/graph";
import type { AgentStarter } from "./schema";

const STATIC_SHARE_PARENT: AgentStarter = {
  id: "share-parent",
  label: "Branches that share a parent?",
  prompt: "Branches that share a parent?",
};

/**
 * Deterministic empty-state chips on hard failure / gate deny only.
 * Loading uses skeleton chips; do not paint these as the optimistic first paint.
 */
export function staticAgentStarters(
  history: RepoHistory,
  defaultBranch?: string,
): AgentStarter[] {
  const resolved = resolveDefaultBranch(history, defaultBranch);
  const branchLabel = resolved?.name ?? "default";
  return [
    {
      id: "recent-merges",
      label: `Recent merges into ${branchLabel}?`,
      prompt: `Recent merges into ${branchLabel}?`,
    },
    STATIC_SHARE_PARENT,
  ];
}
