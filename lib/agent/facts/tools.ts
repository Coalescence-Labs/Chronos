import { resolveAgentAnchorSha } from "@/lib/agent/chat-context";
import { attributeBranches, layoutGraph } from "@/lib/graph";
import type { FactToolContext } from "./types";
import { buildGraphFactBundle, factBundleForSelectedCommit } from "./extract";

export type AgentFactToolName =
  | "graph_summary"
  | "branch_tips"
  | "merge_commits"
  | "anchored_commit";

export interface AgentFactToolResult {
  tool: AgentFactToolName;
  data: unknown;
}

export function runAgentFactTool(
  tool: AgentFactToolName,
  context: FactToolContext,
): AgentFactToolResult {
  const bundle = buildGraphFactBundle(context);
  switch (tool) {
    case "graph_summary":
      return {
        tool,
        data: {
          loadHandle: bundle.loadHandle,
          loadedCommits: bundle.loadedCommits,
          loadedRefs: bundle.loadedRefs,
          refNames: bundle.refs.map((ref) => ref.name).slice(0, 40),
          focusedBranch: context.focusedBranch ?? null,
          contextRefs: (context.contextRefs ?? []).slice(0, 8),
        },
      };
    case "branch_tips": {
      const layout = layoutGraph(context.history);
      const { lines } = attributeBranches(context.history, layout);
      return {
        tool,
        data: lines.slice(0, 30).map((line) => ({
          branch: line.name,
          tipSha: line.tipSha,
          tipRow: line.tipRow,
        })),
      };
    }
    case "merge_commits":
      return {
        tool,
        data: bundle.commits.filter((commit) => commit.merge).slice(0, 40),
      };
    case "anchored_commit": {
      const sha =
        resolveAgentAnchorSha({
          selectedSha: context.selectedSha,
          contextRefs: context.contextRefs,
          focusedBranch: context.focusedBranch,
        }) ?? bundle.commits[0]?.sha;
      if (!sha) return { tool, data: { anchor: null, loadHandle: bundle.loadHandle } };
      return { tool, data: factBundleForSelectedCommit(bundle, sha) };
    }
    default:
      return { tool, data: { error: "unknown_tool" } };
  }
}

export const AGENT_FACT_TOOL_NAMES: AgentFactToolName[] = [
  "graph_summary",
  "branch_tips",
  "merge_commits",
  "anchored_commit",
];
