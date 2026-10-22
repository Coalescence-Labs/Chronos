import { chronosKey, getRedis } from "@/lib/redis";
import {
  agentStartersResponseSchema,
  type AgentStartersResponse,
} from "./schema";
import { buildStarterCacheMaterial } from "./fingerprint";
import type { RepoHistory } from "@/lib/graph";

/** In-process fallback when Upstash is unset (tests / local without Redis). */
const memoryCache = new Map<string, { expiresAt: number; value: AgentStartersResponse }>();

/**
 * Redis key recipe:
 * `chronos:agent-starters:{snapshotHash}`
 *
 * `snapshotHash` = sha256(owner/repo \\0 workosUserId \\0 d-m-y \\0 fingerprint).slice(0, 32)
 * where fingerprint = `tips={sorted branch tip SHAs}|count={n}|default={branch}`.
 *
 * Values: Zod-validated `{ starters }` only (labels/prompts — no SHAs, messages, or PII).
 *
 * Hot path: `generateAgentStarters` runs gate + this GET in parallel. On hit, return
 * immediately (no Haiku). Target GET latency ≤ ~25ms (Upstash REST); see `cacheReadMs`.
 */
export function starterCacheKey(snapshotHash: string): string {
  return chronosKey("agent-starters", snapshotHash);
}

export function resolveStarterCacheKey(input: {
  owner: string;
  repo: string;
  workosUserId: string;
  history: RepoHistory;
  defaultBranch?: string;
  now?: Date;
}): { key: string; snapshotHash: string; fingerprint: string; dayKey: string } {
  const { snapshotHash, fingerprint, dayKey } = buildStarterCacheMaterial(input);
  return { key: starterCacheKey(snapshotHash), snapshotHash, fingerprint, dayKey };
}

function secondsUntilUtcMidnight(now = new Date()): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(60, Math.ceil((next - now.getTime()) / 1000));
}

export async function readStarterCache(key: string): Promise<AgentStartersResponse | null> {
  const redis = getRedis();
  if (redis) {
    try {
      const raw = await redis.get<unknown>(key);
      if (raw == null) return null;
      const parsed = agentStartersResponseSchema.safeParse(
        typeof raw === "string" ? JSON.parse(raw) : raw,
      );
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return entry.value;
}

export async function writeStarterCache(
  key: string,
  value: AgentStartersResponse,
  now = new Date(),
): Promise<void> {
  const ttl = secondsUntilUtcMidnight(now);
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(key, value, { ex: ttl });
    } catch {
      // Best-effort; generation still succeeded.
    }
    return;
  }
  memoryCache.set(key, { expiresAt: Date.now() + ttl * 1000, value });
}

/** Test helper — clear process-memory cache. */
export function clearStarterMemoryCache(): void {
  memoryCache.clear();
}
