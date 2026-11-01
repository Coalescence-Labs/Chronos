import { resolveDefaultBranch, type RepoHistory } from "@/lib/graph";
import { runAgentFactTool } from "@/lib/agent/facts/tools";
import {
  MAX_STARTER_CONTEXT_CHARS,
  clampStarterContextJson,
} from "./budget";

/**
 * Compact graph facts for Haiku starter generation — same privacy class as
 * Agent fact tools (authors omitted; no file contents / diffs / secrets).
 */
export function buildStarterGraphContext(input: {
  owner: string;
  repo: string;
  history: RepoHistory;
  defaultBranch?: string;
}): { context: Record<string, unknown>; contextJson: string; truncated: boolean } {
  const summary = runAgentFactTool("graph_summary", {
    owner: input.owner,
    repo: input.repo,
    history: input.history,
  });
  const tips = runAgentFactTool("branch_tips", {
    owner: input.owner,
    repo: input.repo,
    history: input.history,
  });
  const merges = runAgentFactTool("merge_commits", {
    owner: input.owner,
    repo: input.repo,
    history: input.history,
  });

  const resolved = resolveDefaultBranch(input.history, input.defaultBranch);
  const mergeRows = Array.isArray(merges.data) ? merges.data : [];
  const compactMerges = mergeRows.slice(0, 12).map((row) => {
    const commit = row as { sha?: string; date?: string; message?: string };
    return {
      sha: typeof commit.sha === "string" ? commit.sha.slice(0, 7) : "",
      date: typeof commit.date === "string" ? commit.date.slice(0, 10) : "",
      message:
        typeof commit.message === "string"
          ? commit.message.split("\n")[0]?.slice(0, 80) ?? ""
          : "",
    };
  });

  const tipRows = Array.isArray(tips.data) ? tips.data : [];
  const compactTips = tipRows.slice(0, 20).map((row) => {
    const tip = row as { branch?: string; tipSha?: string };
    return {
      branch: typeof tip.branch === "string" ? tip.branch.slice(0, 80) : "",
      tipSha: typeof tip.tipSha === "string" ? tip.tipSha.slice(0, 7) : "",
    };
  });

  const context: Record<string, unknown> = {
    repo: `${input.owner}/${input.repo}`,
    defaultBranch: resolved?.name ?? null,
    loadedCommits: input.history.commits.length,
    loadedRefs: input.history.refs.length,
    refNames: (summary.data as { refNames?: string[] }).refNames?.slice(0, 30) ?? [],
    branchTips: compactTips,
    recentMerges: compactMerges,
  };

  let contextJson = JSON.stringify(context);
  let truncated = false;
  if (contextJson.length > MAX_STARTER_CONTEXT_CHARS) {
    // Drop merges first, then tips, then clamp hard.
    context.recentMerges = compactMerges.slice(0, 4);
    contextJson = JSON.stringify(context);
  }
  if (contextJson.length > MAX_STARTER_CONTEXT_CHARS) {
    context.branchTips = compactTips.slice(0, 8);
    contextJson = JSON.stringify(context);
  }
  if (contextJson.length > MAX_STARTER_CONTEXT_CHARS) {
    contextJson = clampStarterContextJson(contextJson);
    truncated = true;
  }
  return { context, contextJson, truncated };
}
