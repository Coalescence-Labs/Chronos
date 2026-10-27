/**
 * Haiku input budget for empty-chat starter generation.
 *
 * Layered *under* the hard Haiku rails in `lib/agent/spend-limits.ts`
 * (500k in / 500k out). Starters use a tighter operational cap so a single
 * starter generation stays near **$0.05** even under conservative list pricing.
 *
 * Pricing basis (conservative, fail-closed):
 * - Claude Haiku 4.5 / 5.5 class input ≈ **$1.00 per 1M tokens**
 *   (hard rail documents ~$0.10/MTok at 500k; starters keep $1/MTok so we never
 *   overshoot a $0.05 input allowance under list-class rates).
 * - Cap: **$0.05** → 0.05 / (1/1e6) = **50_000 input tokens**.
 * - Char→token: shared **AGENT_CHARS_PER_TOKEN** (3) from spend-limits.
 * - Max prompt chars = 50_000 × 3 = **150_000**.
 * - Reserve ~2_500 chars for instructions / schema guidance →
 *   **MAX_STARTER_CONTEXT_CHARS = 147_500** for the graph-facts payload.
 *
 * If the clamped context + instructions still exceed the hard char cap,
 * generation must refuse (fail closed) rather than truncate silently past budget.
 * Gateway calls still pass `maxOutputTokens` from the hard Haiku rail.
 */

import {
  AGENT_CHARS_PER_TOKEN,
  AGENT_SINGLE_CALL_INPUT_BUDGET_USD,
} from "@/lib/agent/spend-limits";

/** Conservative Haiku input list rate for starter *operational* budget. */
export const HAIKU_INPUT_USD_PER_MTOK = 1.0;
export const STARTER_INPUT_BUDGET_USD = AGENT_SINGLE_CALL_INPUT_BUDGET_USD;
export const STARTER_CHARS_PER_TOKEN = AGENT_CHARS_PER_TOKEN;

export const STARTER_MAX_INPUT_TOKENS = Math.floor(
  (STARTER_INPUT_BUDGET_USD / HAIKU_INPUT_USD_PER_MTOK) * 1_000_000,
); // 50_000

export const STARTER_MAX_INPUT_CHARS = STARTER_MAX_INPUT_TOKENS * STARTER_CHARS_PER_TOKEN; // 150_000

/** Chars reserved for system/instruction text around the facts JSON. */
export const STARTER_INSTRUCTION_RESERVE_CHARS = 2_500;

export const MAX_STARTER_CONTEXT_CHARS =
  STARTER_MAX_INPUT_CHARS - STARTER_INSTRUCTION_RESERVE_CHARS; // 147_500

export function estimatePromptChars(instruction: string, contextJson: string): number {
  return instruction.length + contextJson.length;
}

export function isWithinStarterInputBudget(instruction: string, contextJson: string): boolean {
  return estimatePromptChars(instruction, contextJson) <= STARTER_MAX_INPUT_CHARS;
}

/** Clamp a string payload to the context char budget (fail-closed caller still checks total). */
export function clampStarterContextJson(json: string, maxChars = MAX_STARTER_CONTEXT_CHARS): string {
  if (json.length <= maxChars) return json;
  return json.slice(0, maxChars);
}
