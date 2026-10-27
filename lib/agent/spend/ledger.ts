import { chronosKey, getRedis, isRedisConfigured } from "@/lib/redis";

const MONTHLY_CAP_USD = 5;
const LEDGER_TTL_SECONDS = 60 * 60 * 24 * 40;

/**
 * Atomic capped reservation (Redis EVAL).
 * KEYS = ledger, reservation; ARGV = delta, cap, ttlSeconds.
 * Returns 1 on success, 0 when the cap would be exceeded.
 */
const RESERVE_LUA = `
local current = tonumber(redis.call("GET", KEYS[1]) or "0")
local delta = tonumber(ARGV[1])
local cap = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])
if redis.call("EXISTS", KEYS[2]) == 1 then return 0 end
if (not delta) or delta <= 0 then
  return 0
end
if (current + delta) > cap then
  return 0
end
local next = current + delta
redis.call("SET", KEYS[1], tostring(next), "EX", ttl)
redis.call("SET", KEYS[2], ARGV[1], "EX", ttl)
return 1
`;

const SETTLE_LUA = `
local reserved = tonumber(redis.call("GET", KEYS[2]))
if not reserved then return 0 end
local current = tonumber(redis.call("GET", KEYS[1]))
if not current then return 0 end
local actual = tonumber(ARGV[1])
if (not actual) or actual < 0 then return 0 end
local next = math.max(0, current - reserved + actual)
redis.call("SET", KEYS[1], tostring(next), "EX", tonumber(ARGV[2]))
redis.call("DEL", KEYS[2])
return 1
`;

export interface AgentSpendReservation {
  ledgerKey: string;
  reservationKey: string;
  reservedUsd: number;
}

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
export async function reserveAgentSpendUsd(
  workosUserId: string,
  deltaUsd: number,
  now: Date = new Date(),
): Promise<AgentSpendReservation | null> {
  const redis = getRedis();
  if (!redis || !Number.isFinite(deltaUsd) || deltaUsd <= 0) return null;
  const key = agentSpendLedgerKey(workosUserId, now);
  const reservationKey = chronosKey("agent-spend-reservation", agentSpendMonthKey(now), workosUserId.trim(), crypto.randomUUID());
  const result = await redis.eval<string[], number>(
    RESERVE_LUA,
    [key, reservationKey],
    [String(deltaUsd), String(MONTHLY_CAP_USD), String(LEDGER_TTL_SECONDS)],
  );
  return result === 1 ? { ledgerKey: key, reservationKey, reservedUsd: deltaUsd } : null;
}

/** Settle exactly once in the original month, even when a call crosses midnight. */
export async function settleAgentSpendUsd(
  reservation: AgentSpendReservation,
  actualUsd: number,
): Promise<void> {
  const redis = getRedis();
  if (!redis || !Number.isFinite(actualUsd) || actualUsd < 0) {
    throw new Error("Agent spend settlement unavailable");
  }
  // Never cap the receipt: an unexpected overrun must block further reservations.
  await redis.eval<string[], number>(
    SETTLE_LUA,
    [reservation.ledgerKey, reservation.reservationKey],
    [String(actualUsd), String(LEDGER_TTL_SECONDS)],
  );
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
