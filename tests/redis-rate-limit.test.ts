import { afterAll, afterEach, beforeAll, describe, expect, mock, spyOn, test } from "bun:test";

type LimitResult = { success: boolean; reset: number; reason?: string };
let limit: (identity: string) => Promise<LimitResult>;

mock.module("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static slidingWindow() {
      return () => ({});
    }
    limit = (identity: string) => limit(identity);
  },
}));

const { enforceDistributedRateLimit } = await import("@/lib/redis/rate-limit");

const IDENTITY = "agent:user:user_private_identity";
const saved = { url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN };

beforeAll(() => {
  process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "token";
});
afterAll(() => {
  for (const [key, value] of [["UPSTASH_REDIS_REST_URL", saved.url], ["UPSTASH_REDIS_REST_TOKEN", saved.token]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("distributed rate limit", () => {
  const warn = spyOn(console, "warn").mockImplementation(() => {});
  const error = spyOn(console, "error").mockImplementation(() => {});
  afterEach(() => {
    warn.mockClear();
    error.mockClear();
  });
  afterAll(() => {
    warn.mockRestore();
    error.mockRestore();
  });

  test("denies over the limit without logging", async () => {
    limit = async () => ({ success: false, reset: Date.now() + 5_000 });
    const result = await enforceDistributedRateLimit(IDENTITY, "agent");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
    expect(warn).not.toHaveBeenCalled();
  });

  test("allows a timed-out check and says so, without the identity", async () => {
    limit = async () => ({ success: true, reset: 0, reason: "timeout" });
    const result = await enforceDistributedRateLimit(IDENTITY, "agent");
    expect(result.allowed).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("user_private_identity");
  });

  test("rethrows a failed call and logs only the error name", async () => {
    limit = async () => {
      throw new TypeError("request failed for user_private_identity");
    };
    await expect(enforceDistributedRateLimit(IDENTITY, "agent")).rejects.toThrow(TypeError);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]?.[1]).toBe("TypeError");
    expect(JSON.stringify(error.mock.calls)).not.toContain("user_private_identity");
  });
});
