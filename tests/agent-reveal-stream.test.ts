import { describe, expect, test } from "bun:test";
import {
  AGENT_REVEAL_MS_PER_CHAR,
  chunkAgentMarkdown,
  revealAgentText,
} from "@/components/agent/reveal-stream";

describe("agent markdown chunking (Arcadia / Organic LLM)", () => {
  test("keeps fences, headings, lines, and blank newlines intact", () => {
    const text = "# Heading\n\nSome text.\n```ts\nconst n = 1;\n```\n\nFinal line";
    const chunks = chunkAgentMarkdown(text);
    expect(chunks.join("")).toBe(text);
    expect(chunks.some((chunk) => chunk.startsWith("```ts"))).toBe(true);
    expect(chunks.some((chunk) => chunk.startsWith("# Heading"))).toBe(true);
    // No chunk should be an incomplete fence opener alone when a fence is closed.
    expect(chunks.filter((chunk) => chunk.includes("```")).every((chunk) => {
      const ticks = chunk.match(/```/g)?.length ?? 0;
      return ticks === 0 || ticks >= 2 || chunk.trim() === "```";
    })).toBe(true);
  });

  test("consumes blank lines as their own chunks", () => {
    const chunks = chunkAgentMarkdown("a\n\nb");
    expect(chunks.join("")).toBe("a\n\nb");
    expect(chunks).toContain("\n");
  });
});

describe("revealAgentText", () => {
  test("emits growing prefixes on markdown chunk boundaries", async () => {
    const slices: string[] = [];
    const full = "Hello line\n```\ncode\n```\n";
    await revealAgentText(full, (partial) => slices.push(partial));
    expect(slices.at(-1)).toBe(full);
    expect(slices.length).toBeGreaterThan(1);
    for (const slice of slices) {
      expect(full.startsWith(slice)).toBe(true);
    }
  });

  test("uses 10ms-per-character pacing constant", () => {
    expect(AGENT_REVEAL_MS_PER_CHAR).toBe(10);
  });
});
