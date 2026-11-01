import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { IngestError } from "@/lib/ingest/errors";
import { isRedisConfigured } from "@/lib/redis/config";
import { enforceDistributedRateLimit, type RateLimitOperation } from "@/lib/redis/rate-limit";

const salt = randomBytes(32);
const requests = new Map<string, { count: number; reset: number }>();

export function requestRateLimitIdentity(
  request: Request,
  userId?: string | null,
  operation: RateLimitOperation = "repo",
): string {
  const address = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for") : null;
  const identity = userId ? `user:${userId}` : `anonymous:${address ?? "shared"}`;
  return `${operation}:${identity}`;
}

export function isSameOriginMutation(request: Request): boolean {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (!origin || (site && site !== "same-origin" && site !== "none")) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; }
  catch { return false; }
}

/**
 * Instance-local fairness limit — the fallback when Upstash is unset, and used in unit tests.
 * Always enforces; routes should call {@link enforceRequestLimitAsync} so a configured
 * Upstash makes the limit deployment-wide.
 */
export function enforceRequestLimit(
  request: Request,
  userId?: string | null,
  operation: RateLimitOperation = "repo",
): void {
  const key = createHmac("sha256", salt).update(requestRateLimitIdentity(request, userId, operation)).digest("hex");
  const now = Date.now();
  for (const [id, entry] of requests) {
    if (entry.reset > now) break;
    requests.delete(id);
  }
  const entry = requests.get(key) ?? { count: 0, reset: now + 60_000 };
  if (!requests.has(key) && requests.size >= 10_000) {
    throw new IngestError("rate-limited", "Chronos is busy. Please try again shortly.", 60);
  }
  if (++entry.count > (operation === "connection" || operation === "agent" ? 30 : userId ? 120 : 60)) {
    throw new IngestError("rate-limited", "Too many requests. Please wait before trying again.", Math.max(1, Math.ceil((entry.reset - now) / 1000)));
  }
  requests.set(key, entry);
}

let warnedInstanceLocal = false;

/** Production without Upstash enforces per-instance limits only; say so once rather than silently. */
function warnInstanceLocalLimits(): void {
  if (warnedInstanceLocal || process.env.NODE_ENV !== "production") return;
  warnedInstanceLocal = true;
  console.warn("UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN unset — rate limits are per-instance, not deployment-wide");
}

/** Deployment-wide limit when Upstash is configured; otherwise instance-local. */
export async function enforceRequestLimitAsync(
  request: Request,
  userId?: string | null,
  operation: RateLimitOperation = "repo",
): Promise<void> {
  if (!isRedisConfigured()) {
    warnInstanceLocalLimits();
    enforceRequestLimit(request, userId, operation);
    return;
  }
  const identity = requestRateLimitIdentity(request, userId, operation);
  const result = await enforceDistributedRateLimit(identity, operation);
  if (!result.allowed) {
    throw new IngestError(
      "rate-limited",
      "Too many requests. Please wait before trying again.",
      result.retryAfterSeconds,
    );
  }
}
