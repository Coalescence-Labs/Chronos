import { chronosKey, getRedis } from "@/lib/redis";

const MONTHLY_CAP_USD = 5;

function monthKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function ledgerKey(): string {
  return chronosKey("agent-spend", monthKey());
}

export function agentMonthlyCapUsd(): number {
  return MONTHLY_CAP_USD;
}

export async function readAgentSpendUsd(): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;
  const value = await redis.get<number>(ledgerKey());
  return typeof value === "number" ? value : Number(value) || 0;
}

export async function agentSpendBudgetRemainingUsd(): Promise<number> {
  const spent = await readAgentSpendUsd();
  return Math.max(0, MONTHLY_CAP_USD - spent);
}

export async function recordAgentSpendUsd(deltaUsd: number): Promise<boolean> {
  const redis = getRedis();
  if (!redis || deltaUsd <= 0) return false;
  const key = ledgerKey();
  const spent = await readAgentSpendUsd();
  if (spent + deltaUsd > MONTHLY_CAP_USD) return false;
  await redis.set(key, spent + deltaUsd, { ex: 60 * 60 * 24 * 40 });
  return true;
}

export async function isAgentSpendWithinBudget(): Promise<boolean> {
  return (await agentSpendBudgetRemainingUsd()) > 0;
}
