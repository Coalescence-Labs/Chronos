import { describe, expect, test } from "bun:test";
import {
  AGENT_CHARS_PER_TOKEN,
  AGENT_SINGLE_CALL_INPUT_BUDGET_USD,
  AGENT_SINGLE_CALL_OUTPUT_BUDGET_USD,
  HAIKU_HARD_INPUT_USD_PER_MTOK,
  HAIKU_HARD_OUTPUT_USD_PER_MTOK,
  HAIKU_MAX_INPUT_CHARS,
  HAIKU_MAX_INPUT_TOKENS,
  HAIKU_MAX_OUTPUT_TOKENS,
  SONNET_INPUT_USD_PER_MTOK,
  SONNET_MAX_INPUT_CHARS,
  SONNET_MAX_INPUT_TOKENS,
  SONNET_MAX_OUTPUT_TOKENS,
  SONNET_OUTPUT_USD_PER_MTOK,
  clampPromptToInputBudget,
  estimateTokensFromText,
  guardGeneratePrompt,
  isWithinInputTokenBudget,
  tokenCeilingsFor,
} from "@/lib/agent/spend-limits";
import {
  STARTER_CHARS_PER_TOKEN,
  STARTER_INPUT_BUDGET_USD,
  STARTER_MAX_INPUT_TOKENS,
} from "@/lib/agent/starters/budget";

describe("agent spend-limits pricing math", () => {
  test("Haiku hard ceilings are 500k in / 500k out at ~$0.05 / ~$0.25", () => {
    expect(HAIKU_MAX_INPUT_TOKENS).toBe(500_000);
    expect(HAIKU_MAX_OUTPUT_TOKENS).toBe(500_000);
    expect(HAIKU_MAX_INPUT_CHARS).toBe(1_500_000);
    expect(AGENT_SINGLE_CALL_INPUT_BUDGET_USD).toBe(0.05);
    expect(AGENT_SINGLE_CALL_OUTPUT_BUDGET_USD).toBe(0.25);
    expect(HAIKU_HARD_INPUT_USD_PER_MTOK).toBe(0.1);
    expect(HAIKU_HARD_OUTPUT_USD_PER_MTOK).toBe(0.5);
    expect(
      (HAIKU_MAX_INPUT_TOKENS / 1_000_000) * HAIKU_HARD_INPUT_USD_PER_MTOK,
    ).toBeCloseTo(0.05, 10);
    expect(
      (HAIKU_MAX_OUTPUT_TOKENS / 1_000_000) * HAIKU_HARD_OUTPUT_USD_PER_MTOK,
    ).toBeCloseTo(0.25, 10);
  });

  test("Sonnet ceilings derive from $0.05/$0.25 at $3/$15 per MTok", () => {
    expect(SONNET_INPUT_USD_PER_MTOK).toBe(3);
    expect(SONNET_OUTPUT_USD_PER_MTOK).toBe(15);
    expect(SONNET_MAX_INPUT_TOKENS).toBe(16_666);
    expect(SONNET_MAX_OUTPUT_TOKENS).toBe(16_666);
    expect(SONNET_MAX_INPUT_CHARS).toBe(16_666 * 3);
    expect(
      Math.floor((0.05 / SONNET_INPUT_USD_PER_MTOK) * 1_000_000),
    ).toBe(SONNET_MAX_INPUT_TOKENS);
    expect(
      Math.floor((0.25 / SONNET_OUTPUT_USD_PER_MTOK) * 1_000_000),
    ).toBe(SONNET_MAX_OUTPUT_TOKENS);
  });

  test("starters reuse shared $0.05 + 3 chars/token under the hard Haiku rail", () => {
    expect(STARTER_INPUT_BUDGET_USD).toBe(AGENT_SINGLE_CALL_INPUT_BUDGET_USD);
    expect(STARTER_CHARS_PER_TOKEN).toBe(AGENT_CHARS_PER_TOKEN);
    expect(STARTER_MAX_INPUT_TOKENS).toBe(50_000);
    expect(STARTER_MAX_INPUT_TOKENS).toBeLessThan(HAIKU_MAX_INPUT_TOKENS);
  });
});

describe("agent spend-limits clamp / fail-closed", () => {
  test("estimateTokensFromText uses ceil(chars/3)", () => {
    expect(estimateTokensFromText("")).toBe(0);
    expect(estimateTokensFromText("abc")).toBe(1);
    expect(estimateTokensFromText("abcd")).toBe(2);
    expect(AGENT_CHARS_PER_TOKEN).toBe(3);
  });

  test("isWithinInputTokenBudget respects model ceilings", () => {
    expect(isWithinInputTokenBudget("short", "haiku")).toBe(true);
    expect(isWithinInputTokenBudget("short", "sonnet")).toBe(true);
    expect(
      isWithinInputTokenBudget("x".repeat(SONNET_MAX_INPUT_CHARS + 1), "sonnet"),
    ).toBe(false);
    expect(
      isWithinInputTokenBudget("x".repeat(HAIKU_MAX_INPUT_CHARS + 1), "haiku"),
    ).toBe(false);
  });

  test("clampPromptToInputBudget truncates to max input chars", () => {
    const over = "z".repeat(SONNET_MAX_INPUT_CHARS + 50);
    const clamped = clampPromptToInputBudget(over, "sonnet");
    expect(clamped.length).toBe(SONNET_MAX_INPUT_CHARS);
    expect(estimateTokensFromText(clamped)).toBeLessThanOrEqual(SONNET_MAX_INPUT_TOKENS);
  });

  test("guardGeneratePrompt clamps oversized Sonnet prompts and sets maxOutputTokens", () => {
    const over = "p".repeat(SONNET_MAX_INPUT_CHARS + 100);
    const guarded = guardGeneratePrompt(over, "sonnet");
    expect(guarded.ok).toBe(true);
    if (!guarded.ok) return;
    expect(guarded.truncated).toBe(true);
    expect(guarded.prompt.length).toBe(SONNET_MAX_INPUT_CHARS);
    expect(guarded.maxOutputTokens).toBe(SONNET_MAX_OUTPUT_TOKENS);
  });

  test("guardGeneratePrompt passes through in-budget Haiku prompts", () => {
    const prompt = "Classify this graph question.";
    const guarded = guardGeneratePrompt(prompt, "haiku");
    expect(guarded.ok).toBe(true);
    if (!guarded.ok) return;
    expect(guarded.truncated).toBe(false);
    expect(guarded.prompt).toBe(prompt);
    expect(guarded.maxOutputTokens).toBe(HAIKU_MAX_OUTPUT_TOKENS);
  });

  test("guardGeneratePrompt refuses empty-after-clamp", () => {
    const guarded = guardGeneratePrompt("   ", "haiku");
    expect(guarded.ok).toBe(false);
    if (guarded.ok) return;
    expect(guarded.error).toContain("empty");
  });

  test("tokenCeilingsFor matches exported constants", () => {
    expect(tokenCeilingsFor("haiku")).toEqual({
      maxInputTokens: HAIKU_MAX_INPUT_TOKENS,
      maxOutputTokens: HAIKU_MAX_OUTPUT_TOKENS,
      maxInputChars: HAIKU_MAX_INPUT_CHARS,
    });
    expect(tokenCeilingsFor("sonnet")).toEqual({
      maxInputTokens: SONNET_MAX_INPUT_TOKENS,
      maxOutputTokens: SONNET_MAX_OUTPUT_TOKENS,
      maxInputChars: SONNET_MAX_INPUT_CHARS,
    });
  });
});
