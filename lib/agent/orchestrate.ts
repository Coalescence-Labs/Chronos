import { generateText, gateway } from "ai";
import type { RepoHistory } from "@/lib/graph";
import { agentGateMessage, evaluateAgentGate } from "./gate";
import { classifyQuestionWithJev } from "./jev";
import { agentSonnetModelId } from "./models";
import { runAgentFactTool } from "./facts/tools";
import { renderSafeAgentMarkdown } from "./safe-markdown";
import { isAgentSpendWithinBudget, recordAgentSpendUsd } from "./spend";

const ESTIMATED_TURN_USD = 0.02;

export interface AgentTurnInput {
  workosUserId: string;
  owner: string;
  repo: string;
  question: string;
  history: RepoHistory;
  selectedSha?: string | null;
}

export interface AgentTurnResult {
  ok: boolean;
  html?: string;
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

  const jev = await classifyQuestionWithJev(input.question);
  if (!jev.allow) {
    return { ok: false, error: "That question cannot be answered here.", flags: jev.flags };
  }

  const summary = runAgentFactTool("graph_summary", {
    owner: input.owner,
    repo: input.repo,
    history: input.history,
    selectedSha: input.selectedSha,
  });
  const anchor = runAgentFactTool("anchored_commit", {
    owner: input.owner,
    repo: input.repo,
    history: input.history,
    selectedSha: input.selectedSha,
  });
  const loadHandle = (summary.data as { loadHandle?: string }).loadHandle;

  const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: agentGateMessage("not-configured") };
  }

  const reserved = await recordAgentSpendUsd(ESTIMATED_TURN_USD);
  if (!reserved) {
    return { ok: false, error: "Chronos Agent reached its monthly spend cap." };
  }

  try {
    const { text } = await generateText({
      model: gateway(agentSonnetModelId()),
      prompt: [
        "You are Chronos Agent. Answer using ONLY the graph facts JSON below.",
        "Do not invent commits or branches. Authors are omitted by design.",
        "Keep answers concise markdown (bold, code, links allowed).",
        "",
        `Question: ${input.question.trim().slice(0, 2_000)}`,
        "",
        `Facts: ${JSON.stringify({ summary: summary.data, anchor: anchor.data })}`,
      ].join("\n"),
    });
    return {
      ok: true,
      html: renderSafeAgentMarkdown(text),
      flags: jev.flags,
      loadHandle,
    };
  } catch {
    return { ok: false, error: "Chronos Agent could not complete that question." };
  }
}
