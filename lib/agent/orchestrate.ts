import { generateText, gateway } from "ai";
import type { AgentBranchFocus, AgentChatContextRef } from "@/lib/agent/chat-context";
import { agentTurnContextPayload } from "@/lib/agent/chat-context";
import type { RepoHistory } from "@/lib/graph";
import {
  buildAgentTurnPrompt,
  type AgentAnswerUiHint,
} from "./answer-format";
import {
  composeAgentAnswerParts,
  extractAgentLensTargets,
  type AgentGenUiPart,
  type AgentLensTargets,
} from "./gen-ui";
import { agentGateMessage, evaluateAgentGate } from "./gate";
import { classifyQuestionWithJev } from "./jev";
import { agentSonnetModelId } from "./models";
import { runAgentFactTool } from "./facts/tools";
import { fetchPullRequestFacts, questionRequestsPullRequestFacts } from "./pr-tools";
import type { GitHubRequestAuth } from "@/lib/ingest/github/fetch";
import { renderSafeAgentMarkdown } from "./safe-markdown";
import {
  agentMonthlyCapUsd,
  isAgentSpendWithinBudget,
  notifyAgentSpendThreshold,
  readAgentSpendUsd,
  recordAgentSpendUsd,
} from "./spend";
import { guardGeneratePrompt } from "./spend-limits";

const ESTIMATED_TURN_USD = 0.02;

export interface AgentTurnInput {
  workosUserId: string;
  userEmail?: string | null;
  owner: string;
  repo: string;
  question: string;
  history: RepoHistory;
  selectedSha?: string | null;
  focusedBranch?: AgentBranchFocus | null;
  contextRefs?: AgentChatContextRef[];
  /** Client hint for narrow dock / phone tab answer crafting. */
  ui?: AgentAnswerUiHint | null;
  githubAuth?: GitHubRequestAuth | null;
}

export interface AgentTurnResult {
  ok: boolean;
  /** Raw model markdown for client streaming reveal. */
  text?: string;
  html?: string;
  /** Structured gen-UI parts when composition succeeds; client prefers these over html. */
  parts?: AgentGenUiPart[];
  /** Soft GraphView lens targets derived from parts. */
  lens?: AgentLensTargets;
  error?: string;
  flags?: string[];
  loadHandle?: string;
}

export async function runAgentTurn(input: AgentTurnInput): Promise<AgentTurnResult> {
  const gate = await evaluateAgentGate(input.workosUserId, { requireSpendReady: true });
  if (!gate.allowed) {
    return { ok: false, error: agentGateMessage(gate.reason) };
  }
  if (!(await isAgentSpendWithinBudget())) {
    return { ok: false, error: "Chronos Agent reached its monthly spend cap." };
  }

  try {
    const jev = await classifyQuestionWithJev(input.question);
    if (!jev.allow) {
      return { ok: false, error: "That question cannot be answered here.", flags: jev.flags };
    }

    const turnContext = agentTurnContextPayload({
      focusedBranch: input.focusedBranch,
      contextRefs: input.contextRefs,
    });
    const factContext = {
      owner: input.owner,
      repo: input.repo,
      history: input.history,
      selectedSha: input.selectedSha,
      focusedBranch: turnContext.focusedBranch,
      contextRefs: turnContext.contextRefs,
    };
    const summary = runAgentFactTool("graph_summary", factContext);
    const anchor = runAgentFactTool("anchored_commit", factContext);
    const pullRequests =
      input.githubAuth && questionRequestsPullRequestFacts(input.question)
        ? await fetchPullRequestFacts(input.owner, input.repo, input.githubAuth)
        : [];
    const loadHandle = (summary.data as { loadHandle?: string }).loadHandle;

    const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();
    if (!apiKey) {
      return { ok: false, error: agentGateMessage("not-configured") };
    }

    const guarded = guardGeneratePrompt(
      buildAgentTurnPrompt({
        question: input.question,
        factsJson: JSON.stringify({ summary: summary.data, anchor: anchor.data, pullRequests }),
        ui: input.ui,
      }),
      "sonnet",
    );
    if (!guarded.ok) {
      return { ok: false, error: guarded.error };
    }

    const reserved = await recordAgentSpendUsd(ESTIMATED_TURN_USD);
    if (!reserved) {
      return { ok: false, error: "Chronos Agent reached its monthly spend cap." };
    }

    const { text } = await generateText({
      model: gateway(agentSonnetModelId()),
      prompt: guarded.prompt,
      maxOutputTokens: guarded.maxOutputTokens,
    });
    const spent = await readAgentSpendUsd();
    void notifyAgentSpendThreshold(
      input.workosUserId,
      spent,
      agentMonthlyCapUsd(),
      input.userEmail,
    );
    const parts = composeAgentAnswerParts(text, input.history);
    const lens = extractAgentLensTargets(parts, input.history);
    return {
      ok: true,
      text,
      html: renderSafeAgentMarkdown(text),
      ...(parts.length > 0 ? { parts } : {}),
      ...(lens.shas.length > 0 || lens.branches.length > 0 ? { lens } : {}),
      flags: jev.flags,
      loadHandle,
    };
  } catch {
    return { ok: false, error: "Chronos Agent could not complete that question." };
  }
}
