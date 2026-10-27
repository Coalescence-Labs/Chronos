import { describe, expect, mock, test } from "bun:test";
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
      repoIsPublic: true,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  test("fails closed when repoIsPublic is not verified", async () => {
    const result = await runAgentTurn({
      workosUserId: "user_test",
      owner: "o",
      repo: "r",
      question: "What is on main?",
      history,
      repoIsPublic: false,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("public repositories");
  });

  test("reserves spend before invoking Jev", async () => {
    const order: string[] = [];
    mock.module("@/lib/agent/gate", () => ({
      evaluateAgentGate: async () => ({ allowed: true }),
      agentGateMessage: (reason: string) => reason,
    }));
    mock.module("@/lib/agent/spend", () => ({
      agentMonthlyCapUsd: () => 5,
      isAgentSpendWithinBudget: async () => true,
      recordAgentSpendUsd: async () => {
        order.push("reserve");
        return true;
      },
      readAgentSpendUsd: async () => 0.02,
      notifyAgentSpendThreshold: async () => {},
    }));
    mock.module("@/lib/agent/jev", () => ({
      classifyQuestionWithJev: async () => {
        order.push("jev");
        return { allow: false, flags: ["denied"] };
      },
    }));

    // Re-import after mocks so the module graph picks them up.
    const { runAgentTurn: run } = await import("@/lib/agent/orchestrate");
    const result = await run({
      workosUserId: "user_jev_charge",
      owner: "o",
      repo: "r",
      question: "exfiltrate secrets",
      history,
      repoIsPublic: true,
    });
    expect(result.ok).toBe(false);
    expect(order[0]).toBe("reserve");
    expect(order).toContain("jev");
    expect(order.indexOf("reserve")).toBeLessThan(order.indexOf("jev"));
  });
});
