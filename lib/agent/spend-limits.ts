/**
 * Pre-call hard cost/token rails for Chronos Agent gateway generations.
 *
 * These sit *in front of* the monthly Upstash spend ledger (`lib/agent/spend`):
 * refuse or clamp oversized prompts and set `maxOutputTokens` so a single
 * call cannot spike past the dollar targets below. Ledger recording is unchanged.
 *
 * ## Pricing assumptions (document; do not invent tighter product policy)
 *
 * **Haiku 5.5** (Jev, starters, any Haiku Agent path) — owner hard ceilings:
 * - Input: **500_000 tokens** ≈ **$0.05** → implies **$0.10 / MTok** input
 * - Output: **500_000 tokens** ≈ **$0.25** → implies **$0.50 / MTok** output
 * Users should never hit these; they exist to bound accidental spend.
 *
 * **Sonnet 5.5** (answer turns) — same **dollar** caps, derived from list-class rates:
 * - Input **$3.00 / MTok**, output **$15.00 / MTok** (Sonnet 4 / 4.5 / 5.5 class;
 *   Gateway may bill less; we use list as fail-closed ceilings)
 * - Input: $0.05 / $3 × 1e6 = **16_666** tokens
 * - Output: $0.25 / $15 × 1e6 = **16_666** tokens
 *
 * **Char→token:** **3 chars/token** (fail-closed vs ~4 for English; JSON/SHAs pack denser).
 *
 * Starters keep a *tighter* operational Haiku input budget (~$0.05 @ conservative
 * $1/MTok → 50k tokens) in `lib/agent/starters/budget.ts`, layered under this rail.
 */

export type AgentSpendModelKind = "haiku" | "sonnet";

/** Shared dollar targets for a single generation (input / output). */
export const AGENT_SINGLE_CALL_INPUT_BUDGET_USD = 0.05;
export const AGENT_SINGLE_CALL_OUTPUT_BUDGET_USD = 0.25;

/** Fail-closed char→token density (same as starters). */
export const AGENT_CHARS_PER_TOKEN = 3;

// --- Haiku 5.5 (owner hard token ceilings) ---------------------------------

/** Implied by 500k tokens ≈ $0.05. */
export const HAIKU_HARD_INPUT_USD_PER_MTOK = 0.1;
/** Implied by 500k tokens ≈ $0.25. */
export const HAIKU_HARD_OUTPUT_USD_PER_MTOK = 0.5;

export const HAIKU_MAX_INPUT_TOKENS = 500_000;
export const HAIKU_MAX_OUTPUT_TOKENS = 500_000;

export const HAIKU_MAX_INPUT_CHARS = HAIKU_MAX_INPUT_TOKENS * AGENT_CHARS_PER_TOKEN;

// --- Sonnet 5.5 (dollar-equivalent ceilings) -------------------------------

export const SONNET_INPUT_USD_PER_MTOK = 3.0;
export const SONNET_OUTPUT_USD_PER_MTOK = 15.0;

export const SONNET_MAX_INPUT_TOKENS = Math.floor(
  (AGENT_SINGLE_CALL_INPUT_BUDGET_USD / SONNET_INPUT_USD_PER_MTOK) * 1_000_000,
); // 16_666

export const SONNET_MAX_OUTPUT_TOKENS = Math.floor(
  (AGENT_SINGLE_CALL_OUTPUT_BUDGET_USD / SONNET_OUTPUT_USD_PER_MTOK) * 1_000_000,
); // 16_666

export const SONNET_MAX_INPUT_CHARS = SONNET_MAX_INPUT_TOKENS * AGENT_CHARS_PER_TOKEN;

export interface AgentTokenCeilings {
  maxInputTokens: number;
  maxOutputTokens: number;
  maxInputChars: number;
}

export function tokenCeilingsFor(kind: AgentSpendModelKind): AgentTokenCeilings {
  if (kind === "haiku") {
    return {
      maxInputTokens: HAIKU_MAX_INPUT_TOKENS,
      maxOutputTokens: HAIKU_MAX_OUTPUT_TOKENS,
      maxInputChars: HAIKU_MAX_INPUT_CHARS,
    };
  }
  return {
    maxInputTokens: SONNET_MAX_INPUT_TOKENS,
    maxOutputTokens: SONNET_MAX_OUTPUT_TOKENS,
    maxInputChars: SONNET_MAX_INPUT_CHARS,
  };
}

/** Ceiling estimate: chars / 3, rounded up. */
export function estimateTokensFromText(text: string): number {
  if (text.length === 0) return 0;
  return Math.ceil(text.length / AGENT_CHARS_PER_TOKEN);
}

export function isWithinInputTokenBudget(
  prompt: string,
  kind: AgentSpendModelKind,
): boolean {
  const { maxInputTokens } = tokenCeilingsFor(kind);
  return estimateTokensFromText(prompt) <= maxInputTokens;
}

/** Truncate prompt to the model's hard input char ceiling. */
export function clampPromptToInputBudget(
  prompt: string,
  kind: AgentSpendModelKind,
): string {
  const { maxInputChars } = tokenCeilingsFor(kind);
  if (prompt.length <= maxInputChars) return prompt;
  return prompt.slice(0, maxInputChars);
}

export type GuardedGeneratePrompt =
  | { ok: true; prompt: string; maxOutputTokens: number; truncated: boolean }
  | { ok: false; error: string };

/**
 * Fail-closed pre-call guard: clamp oversized prompts to the hard input ceiling,
 * then refuse if still over (should not happen after clamp). Always returns
 * `maxOutputTokens` for `generateText({ maxOutputTokens })` on success.
 */
export function guardGeneratePrompt(
  prompt: string,
  kind: AgentSpendModelKind,
): GuardedGeneratePrompt {
  const ceilings = tokenCeilingsFor(kind);
  const truncated = prompt.length > ceilings.maxInputChars;
  const clamped = truncated ? prompt.slice(0, ceilings.maxInputChars) : prompt;

  if (estimateTokensFromText(clamped) > ceilings.maxInputTokens) {
    return {
      ok: false,
      error: `Prompt exceeded the ${kind} single-call input token guardrail.`,
    };
  }

  if (clamped.trim().length === 0) {
    return { ok: false, error: "Prompt was empty after spend guardrail clamp." };
  }

  return {
    ok: true,
    prompt: clamped,
    maxOutputTokens: ceilings.maxOutputTokens,
    truncated,
  };
}
