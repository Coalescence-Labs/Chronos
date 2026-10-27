import { generateText, gateway } from "ai";
import { agentJevModelId } from "./models";
import { guardGeneratePrompt } from "./spend-limits";
import { withAgentGenerationSpend } from "./spend/generation";

export interface JevClassification {
  allow: boolean;
  flags: string[];
}

function parseJevPayload(text: string): JevClassification {
  try {
    const parsed = JSON.parse(text) as { allow?: boolean; flags?: unknown };
    const flags = Array.isArray(parsed.flags)
      ? parsed.flags.filter((flag): flag is string => typeof flag === "string").slice(0, 8)
      : [];
    return { allow: parsed.allow === true, flags };
  } catch {
    return { allow: false, flags: ["unparseable"] };
  }
}

/** Jev sees only the user question — no repo facts — for allow/flag classification. */
export async function classifyQuestionWithJev(question: string, workosUserId: string): Promise<JevClassification> {
  const trimmed = question.trim().slice(0, 2_000);
  if (!trimmed) return { allow: false, flags: ["empty"] };
  const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();
  if (!apiKey) return { allow: false, flags: ["not-configured"] };

  const guarded = guardGeneratePrompt(
    [
      "You are Jev, a safety classifier for Chronos graph Q&A.",
      "Reply with JSON: {\"allow\":boolean,\"flags\":string[]}.",
      "Allow git graph questions; disallow secrets, credentials, unrelated tasks.",
      "",
      `Question: ${trimmed}`,
    ].join("\n"),
    "haiku",
  );
  if (!guarded.ok) return { allow: false, flags: ["spend-guardrail"] };

  const modelId = agentJevModelId();
  const { text } = await withAgentGenerationSpend(
    { workosUserId, modelId, prompt: guarded.prompt, maxOutputTokens: guarded.maxOutputTokens },
    (limits) => generateText({ model: gateway(modelId), prompt: guarded.prompt, ...limits }),
  );
  return parseJevPayload(text);
}
