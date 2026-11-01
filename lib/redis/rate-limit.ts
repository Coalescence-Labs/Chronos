import { Ratelimit } from "@upstash/ratelimit";
import { getRedis } from "./client";
import { chronosKey } from "./keys";

export type RateLimitOperation = "repo" | "connection" | "agent";

const LIMITS: Record<RateLimitOperation, { requests: number; window: `${number} s` | `${number} m` }> = {
  repo: { requests: 120, window: "1 m" },
  connection: { requests: 30, window: "1 m" },
  agent: { requests: 30, window: "1 m" },
};

const limiters = new Map<RateLimitOperation, Ratelimit>();

function limiterFor(operation: RateLimitOperation): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;
  let limiter = limiters.get(operation);
  if (!limiter) {
    const { requests, window } = LIMITS[operation];
    limiter = new Ratelimit({
      redis,
      prefix: chronosKey("rl", operation),
      limiter: Ratelimit.slidingWindow(requests, window),
      analytics: false,
    });
    limiters.set(operation, limiter);
  }
  return limiter;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export async function enforceDistributedRateLimit(
  identity: string,
  operation: RateLimitOperation,
): Promise<RateLimitResult> {
  const limiter = limiterFor(operation);
  if (!limiter) {
    return { allowed: true, retryAfterSeconds: 0 };
  }
  let result;
  try {
    result = await limiter.limit(identity);
  } catch (error) {
    // Surface Redis-specific failures instead of an unexplained 500. Never log the identity.
    console.error(
      "Upstash rate limiter call failed — verify UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN and Upstash availability",
      error instanceof Error ? error.name : "unknown",
    );
    throw error;
  }
  const retryAfterSeconds = result.reset
    ? Math.max(1, Math.ceil((result.reset - Date.now()) / 1000))
    : 60;
  return { allowed: result.success, retryAfterSeconds };
}
