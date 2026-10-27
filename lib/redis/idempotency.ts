import { getRedis } from "./client";
import { chronosKey } from "./keys";

const DEFAULT_TTL_SECONDS = 86_400;

/** Resend and similar outbound actions — at-most-once per idempotency key. */
export async function claimIdempotencyKey(key: string, ttlSeconds = DEFAULT_TTL_SECONDS): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true;
  const namespaced = chronosKey("idem", key);
  const acquired = await redis.set(namespaced, "1", { nx: true, ex: ttlSeconds });
  return acquired === "OK";
}
