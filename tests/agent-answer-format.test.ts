import { describe, expect, test } from "bun:test";
import {
  agentAnswerFormatInstructions,
  buildAgentTurnPrompt,
  resolveAgentAnswerUi,
} from "@/lib/agent/answer-format";

describe("agent answer format", () => {
  test("defaults to a narrow dock column", () => {
    const ui = resolveAgentAnswerUi(null);
    expect(ui.surface).toBe("narrow-panel");
    expect(ui.density).toBe("narrow");
    expect(ui.approxWidthPx).toBe(360);
  });

  test("clamps client width hints and keeps narrow density under 520px", () => {
    expect(resolveAgentAnswerUi({ approxWidthPx: 40 }).approxWidthPx).toBe(280);
    expect(resolveAgentAnswerUi({ approxWidthPx: 900 }).approxWidthPx).toBe(720);
    expect(resolveAgentAnswerUi({ approxWidthPx: 390, density: "comfortable" }).density).toBe(
      "narrow",
    );
    expect(resolveAgentAnswerUi({ approxWidthPx: 560, density: "comfortable" }).density).toBe(
      "comfortable",
    );
  });

  test("format instructions name the narrow panel and anti-clutter rules", () => {
    const text = agentAnswerFormatInstructions({ density: "narrow", approxWidthPx: 360 });
    expect(text).toContain("360px");
    expect(text).toContain("never an essay");
    expect(text).toContain("sparingly");
    expect(text).toContain("SHA+date");
    expect(text).toContain("Refs first");
    expect(text).toContain("Do not append a SHA next to every ref");
    expect(text).toContain("Never decorate a branch list with tip SHAs");
    expect(text).toContain("bullets");
    expect(text).toContain("≤6 bullets");
    expect(text).toContain("Notes:");
    expect(text).toContain("backticks");
  });

  test("turn prompt includes format rules before the question and facts", () => {
    const prompt = buildAgentTurnPrompt({
      question: "What merged into main?",
      factsJson: '{"ok":true}',
      ui: { surface: "narrow-panel", density: "narrow", approxWidthPx: 360 },
    });
    expect(prompt).toContain("You are Chronos Agent");
    expect(prompt).toContain("360px-wide Agent panel");
    expect(prompt).toContain("never dump SHA+date");
    expect(prompt).toContain("Refs first");
    expect(prompt.indexOf("360px")).toBeLessThan(prompt.indexOf("Question:"));
    expect(prompt).toContain("Question: What merged into main?");
    expect(prompt).toContain('Facts: {"ok":true}');
  });
});
