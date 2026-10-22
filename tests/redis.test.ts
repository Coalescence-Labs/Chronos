import { describe, expect, test } from "bun:test";
import { CHRONOS_REDIS_PREFIX, chronosKey, isRedisConfigured } from "@/lib/redis";
import { claimIdempotencyKey } from "@/lib/redis/idempotency";

describe("redis config", () => {
  test("is unset in the test environment", () => {
    expect(isRedisConfigured()).toBe(false);
  });

  test("namespaces keys under chronos prefix", () => {
    expect(chronosKey("rl", "repo")).toBe(`${CHRONOS_REDIS_PREFIX}rl:repo`);
  });

  test("idempotency claims succeed locally when Redis is absent", async () => {
    expect(await claimIdempotencyKey("test-key")).toBe(true);
    expect(await claimIdempotencyKey("test-key")).toBe(true);
  });
});
