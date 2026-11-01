import { createHash } from "node:crypto";
import { getRedis } from "./client";
import { chronosKey } from "./keys";

const REFRESH_LOCK_TTL_SECONDS = 60;

function refreshLockKey(userId: string, refreshToken: string): string {
  const digest = createHash("sha256").update(`${userId}\0${refreshToken}`).digest("hex");
  return chronosKey("gh-refresh", digest);
}

/**
 * Try to acquire a distributed refresh lock. Returns true when this caller
 * should perform the refresh; false when another instance holds the lock.
 */
export async function tryAcquireGitHubRefreshLock(
  userId: string,
  refreshToken: string,
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true;
  const key = refreshLockKey(userId, refreshToken);
  const acquired = await redis.set(key, "1", { nx: true, ex: REFRESH_LOCK_TTL_SECONDS });
  return acquired === "OK";
}

export async function releaseGitHubRefreshLock(userId: string, refreshToken: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.del(refreshLockKey(userId, refreshToken));
}

/** Store serialized credentials briefly so concurrent waiters can reuse the rotation. */
export async function storeSharedCredentialPayload(
  userId: string,
  refreshToken: string,
  payload: string,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const key = `${refreshLockKey(userId, refreshToken)}:payload`;
  await redis.set(key, payload, { ex: REFRESH_LOCK_TTL_SECONDS });
}

export async function readSharedCredentialPayload(
  userId: string,
  refreshToken: string,
): Promise<string | null> {
  const redis = getRedis();
  if (!redis) return null;
  const value = await redis.get<string>(`${refreshLockKey(userId, refreshToken)}:payload`);
  return value ?? null;
}
