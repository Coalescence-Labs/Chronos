import { describe, expect, test } from "bun:test";
import {
  agentMonthlyCapUsd,
  agentSpendBudgetRemainingUsd,
  agentSpendLedgerKey,
  agentSpendMonthKey,
  agentSpendWindowResetsAt,
  isAgentSpendWithinBudget,
  readAgentSpendUsage,
  tryReserveAgentSpend,
} from "@/lib/agent/spend";

describe("agent spend ledger", () => {
  test("defaults to within budget when Redis is absent", async () => {
    expect(agentMonthlyCapUsd()).toBe(5);
    expect(await agentSpendBudgetRemainingUsd("user_a")).toBe(5);
    expect(await isAgentSpendWithinBudget("user_a")).toBe(true);
  });

  test("month key and reset use UTC calendar months", () => {
    const lateOctober = new Date("2026-10-31T23:30:00.000Z");
    expect(agentSpendMonthKey(lateOctober)).toBe("2026-10");
    expect(agentSpendWindowResetsAt(lateOctober).toISOString()).toBe("2026-11-01T00:00:00.000Z");

    const january = new Date("2026-01-15T12:00:00.000Z");
    expect(agentSpendMonthKey(january)).toBe("2026-01");
    expect(agentSpendWindowResetsAt(january).toISOString()).toBe("2026-02-01T00:00:00.000Z");
  });

  test("ledger keys are per user + month under chronos:", () => {
    const now = new Date("2026-10-22T12:00:00.000Z");
    expect(agentSpendLedgerKey("user_a", now)).toBe("chronos:agent-spend:2026-10:user_a");
    expect(agentSpendLedgerKey("user_b", now)).toBe("chronos:agent-spend:2026-10:user_b");
    expect(agentSpendLedgerKey("user_a", now)).not.toBe(agentSpendLedgerKey("user_b", now));
  });

  test("usage snapshot is unavailable when spend Redis is missing", async () => {
    const usage = await readAgentSpendUsage("user_a", new Date("2026-10-22T12:00:00.000Z"));
    expect(usage).toEqual({ available: false });
  });

  test("tryReserveAgentSpend rejects over-cap and accepts under-cap", () => {
    expect(tryReserveAgentSpend(4.98, 0.02)).toEqual({ ok: true, nextUsd: 5 });
    expect(tryReserveAgentSpend(4.98, 0.03)).toEqual({ ok: false });
    expect(tryReserveAgentSpend(5, 0.01)).toEqual({ ok: false });
  });

  test("concurrent reserves cannot all succeed past the cap", () => {
    // Simulate the Lua math: three parallel $0.02 attempts at $4.98 spent.
    let spent = 4.98;
    const outcomes: boolean[] = [];
    for (let i = 0; i < 3; i++) {
      const result = tryReserveAgentSpend(spent, 0.02);
      if (result.ok) {
        spent = result.nextUsd;
        outcomes.push(true);
      } else {
        outcomes.push(false);
      }
    }
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    expect(spent).toBe(5);
  });
});
