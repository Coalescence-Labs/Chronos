import { chronosKey, getRedis, isRedisConfigured } from "@/lib/redis";

const MONTHLY_CAP_USD = 5;
const LEDGER_TTL_SECONDS = 60 * 60 * 24 * 40;

/**
 * Atomic capped reservation (Redis EVAL).
 * KEYS[1] = ledger key; ARGV = delta, cap, ttlSeconds.
 * Returns 1 on success, 0 when the cap would be exceeded.
 */
const RESERVE_LUA = `
local current = tonumber(redis.call("GET", KEYS[1]) or "0")
local delta = tonumber(ARGV[1])
local cap = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])
if (not delta) or delta <= 0 then
  return 0
end
if (current + delta) > cap then
  return 0
end
local next = current + delta
redis.call("SET", KEYS[1], tostring(next), "EX", ttl)
return 1
`;

/** UTC calendar month key matching Redis `chronos:agent-spend:YYYY-MM:…`. */
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

/**
 * Per-user monthly ledger key: `chronos:agent-spend:{YYYY-MM}:{workosUserId}`.
 * Migrated from the shared `chronos:agent-spend:{YYYY-MM}` month-only scheme.
 */
export function agentSpendLedgerKey(workosUserId: string, now: Date = new Date()): string {
  const userId = workosUserId.trim();
  if (!userId) {
    throw new Error("agent spend ledger requires a WorkOS user id");
  }
  return chronosKey("agent-spend", agentSpendMonthKey(now), userId);
}

/** Pure capped reservation — same math as the Redis Lua script (for tests). */
export function tryReserveAgentSpend(
  currentUsd: number,
  deltaUsd: number,
  capUsd: number = MONTHLY_CAP_USD,
): { ok: true; nextUsd: number } | { ok: false } {
  if (!(deltaUsd > 0) || !Number.isFinite(deltaUsd) || !Number.isFinite(currentUsd)) {
    return { ok: false };
  }
  if (currentUsd + deltaUsd > capUsd) return { ok: false };
  return { ok: true, nextUsd: currentUsd + deltaUsd };
}

export function agentMonthlyCapUsd(): number {
  return MONTHLY_CAP_USD;
}

export async function readAgentSpendUsd(workosUserId: string): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;
  const value = await redis.get<number | string>(agentSpendLedgerKey(workosUserId));
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  return Number(value) || 0;
}

export async function agentSpendBudgetRemainingUsd(workosUserId: string): Promise<number> {
  const spent = await readAgentSpendUsd(workosUserId);
  return Math.max(0, MONTHLY_CAP_USD - spent);
}

/**
 * Atomically reserve `deltaUsd` against the user's monthly cap.
 * Concurrent callers cannot overwrite each other or exceed the cap.
 */
export async function recordAgentSpendUsd(
  workosUserId: string,
  deltaUsd: number,
): Promise<boolean> {
  const redis = getRedis();
  if (!redis || deltaUsd <= 0) return false;
  const key = agentSpendLedgerKey(workosUserId);
  const result = await redis.eval<string[], number>(
    RESERVE_LUA,
    [key],
    [String(deltaUsd), String(MONTHLY_CAP_USD), String(LEDGER_TTL_SECONDS)],
  );
  return result === 1;
}

export async function isAgentSpendWithinBudget(workosUserId: string): Promise<boolean> {
  return (await agentSpendBudgetRemainingUsd(workosUserId)) > 0;
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
  workosUserId: string,
  now: Date = new Date(),
): Promise<AgentSpendUsage> {
  if (!isRedisConfigured()) return { available: false };
  const spent = await readAgentSpendUsd(workosUserId);
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
