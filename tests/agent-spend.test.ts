import { describe, expect, test } from "bun:test";
import {
  agentMonthlyCapUsd,
  agentSpendBudgetRemainingUsd,
  agentSpendMonthKey,
  agentSpendWindowResetsAt,
  isAgentSpendWithinBudget,
  readAgentSpendUsage,
} from "@/lib/agent/spend";

describe("agent spend ledger", () => {
  test("defaults to within budget when Redis is absent", async () => {
    expect(agentMonthlyCapUsd()).toBe(5);
    expect(await agentSpendBudgetRemainingUsd()).toBe(5);
    expect(await isAgentSpendWithinBudget()).toBe(true);
  });

  test("month key and reset use UTC calendar months", () => {
    const lateOctober = new Date("2026-10-31T23:30:00.000Z");
    expect(agentSpendMonthKey(lateOctober)).toBe("2026-10");
    expect(agentSpendWindowResetsAt(lateOctober).toISOString()).toBe("2026-11-01T00:00:00.000Z");

    const january = new Date("2026-01-15T12:00:00.000Z");
    expect(agentSpendMonthKey(january)).toBe("2026-01");
    expect(agentSpendWindowResetsAt(january).toISOString()).toBe("2026-02-01T00:00:00.000Z");
  });

  test("usage snapshot is unavailable when spend Redis is missing", async () => {
    const usage = await readAgentSpendUsage(new Date("2026-10-22T12:00:00.000Z"));
    expect(usage).toEqual({ available: false });
  });
});
