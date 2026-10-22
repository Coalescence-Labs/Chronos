import { describe, expect, test } from "bun:test";
import {
  agentMonthlyCapUsd,
  agentSpendBudgetRemainingUsd,
  isAgentSpendWithinBudget,
} from "@/lib/agent/spend";

describe("agent spend ledger", () => {
  test("defaults to within budget when Redis is absent", async () => {
    expect(agentMonthlyCapUsd()).toBe(5);
    expect(await readSafeRemaining()).toBe(5);
    expect(await isAgentSpendWithinBudget()).toBe(true);
  });
});

async function readSafeRemaining(): Promise<number> {
  return agentSpendBudgetRemainingUsd();
}
