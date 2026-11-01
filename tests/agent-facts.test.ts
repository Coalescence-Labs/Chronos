import { describe, expect, test } from "bun:test";
import { buildGraphFactBundle, runAgentFactTool } from "@/lib/agent/facts";
import { buildLoadHandle } from "@/lib/agent/facts/load-handle";
import type { RepoHistory } from "@/lib/graph";

const sample: RepoHistory = {
  commits: [
    { sha: "c2", parents: ["c1", "c0"], author: "hidden", date: "2026-01-02T00:00:00Z", message: "Merge feature" },
    { sha: "c0", parents: [], author: "hidden", date: "2025-12-31T00:00:00Z", message: "Side" },
    { sha: "c1", parents: [], author: "hidden", date: "2026-01-01T00:00:00Z", message: "Root" },
  ],
  refs: [{ name: "main", type: "branch", sha: "c2" }],
};

describe("agent facts", () => {
  test("load handle is stable for the same loaded slice", () => {
    expect(buildLoadHandle("o", "r", sample)).toBe(buildLoadHandle("o", "r", sample));
  });

  test("fact bundle omits author fields", () => {
    const bundle = buildGraphFactBundle({ owner: "o", repo: "r", history: sample });
    expect(JSON.stringify(bundle)).not.toContain("author");
    expect(bundle.commits[0]?.merge).toBe(true);
  });

  test("branch tips tool returns attributed branches", () => {
    const result = runAgentFactTool("branch_tips", { owner: "o", repo: "r", history: sample });
    expect(result.tool).toBe("branch_tips");
    expect(Array.isArray(result.data)).toBe(true);
  });
});
