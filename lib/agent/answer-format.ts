/**
 * Answer-crafting constraints for Chronos Agent Graph Q&A.
 * The Agent UI is a narrow dock (~320–380px) on desktop and a full-width tab on
 * mobile — both read as a tight column. Prompt text must stay self-aware of that
 * space so replies stay scannable (PRODUCT.md: high density, low cognitive load).
 */

export type AgentAnswerSurface = "narrow-panel";

export type AgentUiDensity = "narrow" | "comfortable";

export interface AgentAnswerUiHint {
  /** Always narrow today; reserved if a wider Agent surface appears later. */
  surface?: AgentAnswerSurface;
  /** Approximate content column width in CSS pixels when known. */
  approxWidthPx?: number;
  density?: AgentUiDensity;
}

const NARROW_DOCK_PX = 360;

/** Normalize optional client hints; default to the desktop dock column. */
export function resolveAgentAnswerUi(hint?: AgentAnswerUiHint | null): {
  surface: AgentAnswerSurface;
  approxWidthPx: number;
  density: AgentUiDensity;
} {
  const approxWidthPx =
    typeof hint?.approxWidthPx === "number" && Number.isFinite(hint.approxWidthPx)
      ? Math.min(720, Math.max(280, Math.round(hint.approxWidthPx)))
      : NARROW_DOCK_PX;
  const density =
    hint?.density === "comfortable" && approxWidthPx >= 520 ? "comfortable" : "narrow";
  return {
    surface: "narrow-panel",
    approxWidthPx,
    density,
  };
}

/**
 * Formatting + length rules injected into the model prompt.
 * Exported so tests can lock the cognitive-load constraints without calling the gateway.
 */
export function agentAnswerFormatInstructions(ui?: AgentAnswerUiHint | null): string {
  const resolved = resolveAgentAnswerUi(ui);
  const widthLine =
    resolved.density === "narrow"
      ? `UI: answers render in a ~${resolved.approxWidthPx}px-wide Agent panel (desktop dock or phone tab). Write for that width — never an essay.`
      : `UI: answers render in a ~${resolved.approxWidthPx}px-wide Agent surface. Prefer scannable structure.`;

  return [
    widthLine,
    "Length: hard cap — at most ~4 short lines or ≤6 bullets. Lead with the answer; zero preamble or restating the question.",
    "Structure: bullets only when listing ≥2 items. No “Notes:”, no numbered essays, no multi-paragraph dumps.",
    "Density: one fact per bullet; omit filler verbs (“landed as”, “recent merges on … first-parent line”). Prefer branch/tag refs over prose.",
    "Refs first: branch and tag names are the primary entities. Do not append a SHA next to every ref (no `branch` · `sha`, no `branch (sha)`).",
    "Hashes: include a short SHA only when the question asks for commits/SHAs, or when a hash alone disambiguates. Never decorate a branch list with tip SHAs.",
    "Inline code: sparingly — branch/tag names by default; short SHAs (7 chars) only when a hash is required. Do not wrap every token.",
    "Metadata: never dump SHA+date on every line. Date or full SHA only when the question asks or it disambiguates.",
    "Lists: one line per item; truncate long branch names with … mid-name if needed. Cap at 6 items — say “+N more” if truncated.",
    "Markdown: short lists, rare bold, rare inline code. Prefer bullets; avoid headings and code fences unless a tiny snippet is required.",
    "Entities: put branch/tag names (and SHAs only when needed) in backticks so the UI can lift them into typed primitives.",
  ].join("\n");
}

export function buildAgentTurnPrompt(input: {
  question: string;
  factsJson: string;
  ui?: AgentAnswerUiHint | null;
}): string {
  return [
    "You are Chronos Agent. Answer using ONLY the graph facts JSON below.",
    "Do not invent commits or branches. Authors are omitted by design.",
    "",
    agentAnswerFormatInstructions(input.ui),
    "",
    `Question: ${input.question.trim().slice(0, 2_000)}`,
    "",
    `Facts: ${input.factsJson}`,
  ].join("\n");
}
