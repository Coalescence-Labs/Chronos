import { describe, expect, test } from "bun:test";
import { runAgentTurn } from "@/lib/agent/orchestrate";
import type { RepoHistory } from "@/lib/graph";

const history: RepoHistory = {
  commits: [{ sha: "a", parents: [], author: "x", date: "2026-01-01T00:00:00Z", message: "init" }],
  refs: [{ name: "main", type: "branch", sha: "a" }],
};

describe("agent orchestrate", () => {
  test("refuses live turns without spend-ready Redis", async () => {
    const result = await runAgentTurn({
      workosUserId: "user_test",
      owner: "o",
      repo: "r",
      question: "What is on main?",
      history,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
