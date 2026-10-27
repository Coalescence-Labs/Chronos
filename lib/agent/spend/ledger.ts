import { chronosKey, getRedis, isRedisConfigured } from "@/lib/redis";

const MONTHLY_CAP_USD = 5;

/** UTC calendar month key matching Redis `chronos:agent-spend:YYYY-MM`. */
export function agentSpendMonthKey(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Instant the current UTC spend window ends (start of next UTC calendar month).
 * Matches the ledger month key rollover.
 */
export function agentSpendWindowResetsAt(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

function ledgerKey(now?: Date): string {
  return chronosKey("agent-spend", agentSpendMonthKey(now));
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

/** Account / UI snapshot — percent + reset only; no dollar amounts. */
export type AgentSpendUsage =
  | { available: false }
  | {
      available: true;
      /** 0–100, rounded; relative to the monthly cap. */
      percentUsed: number;
      /** ISO timestamp of UTC month-boundary reset. */
      resetsAt: string;
    };

/**
 * Read current-month usage for Account UI.
 * When spend Redis is missing, returns `{ available: false }` — never a fake 0%.
 */
export async function readAgentSpendUsage(
  now: Date = new Date(),
): Promise<AgentSpendUsage> {
  if (!isRedisConfigured()) return { available: false };
  const spent = await readAgentSpendUsd();
  const percentUsed =
    MONTHLY_CAP_USD <= 0
      ? 0
      : Math.min(100, Math.round((spent / MONTHLY_CAP_USD) * 100));
  return {
    available: true,
    percentUsed,
    resetsAt: agentSpendWindowResetsAt(now).toISOString(),
  };
}
