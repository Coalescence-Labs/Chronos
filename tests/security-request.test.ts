import { afterEach, describe, expect, test } from "bun:test";
import { enforceRequestLimit, enforceRequestLimitAsync, isSameOriginMutation } from "@/lib/security/request";
import { contentSecurityPolicy } from "@/lib/security/headers";

describe("mutation origin protection", () => {
  test("rejects other sites, sibling subdomains, null and missing origins", () => {
    for (const origin of ["https://evil.test", "https://other.chronos.test", "null", undefined]) {
      const headers: HeadersInit = origin ? { origin } : {};
      expect(isSameOriginMutation(new Request("https://chronos.test/api/github/disconnect", { method: "POST", headers }))).toBe(false);
    }
  });
  test("accepts the browser's exact origin and rejects contradictory Fetch Metadata", () => {
    expect(isSameOriginMutation(new Request("https://chronos.test/api/github/disconnect", { method: "POST", headers: { origin: "https://chronos.test", "sec-fetch-site": "same-origin" } }))).toBe(true);
    expect(isSameOriginMutation(new Request("https://chronos.test/api/github/disconnect", { method: "POST", headers: { origin: "https://chronos.test", "sec-fetch-site": "cross-site" } }))).toBe(false);
  });
});
describe("request fairness", () => {
  test("one user's burst cannot consume another user's allowance", () => {
    const request = new Request("https://chronos.test/api/repo");
    for (let i = 0; i < 120; i++) enforceRequestLimit(request, "burst_user");
    expect(() => enforceRequestLimit(request, "burst_user")).toThrow("Too many requests");
    expect(() => enforceRequestLimit(request, "another_user")).not.toThrow();
  });
});
describe("instance-local limiter", () => {
  const saved = { url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN };
  afterEach(() => {
    for (const [key, value] of [["UPSTASH_REDIS_REST_URL", saved.url], ["UPSTASH_REDIS_REST_TOKEN", saved.token]] as const) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  test("the sync limiter still enforces when Upstash is configured", () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    const request = new Request("https://chronos.test/api/github/status");
    for (let i = 0; i < 30; i++) enforceRequestLimit(request, "configured_user", "connection");
    expect(() => enforceRequestLimit(request, "configured_user", "connection")).toThrow("Too many requests");
  });
  test("agent requests get their own 30/minute bucket without Upstash", async () => {
    const request = new Request("https://chronos.test/api/agent/chat", { method: "POST" });
    for (let i = 0; i < 30; i++) await enforceRequestLimitAsync(request, "agent_user", "agent");
    await expect(enforceRequestLimitAsync(request, "agent_user", "agent")).rejects.toThrow("Too many requests");
    await expect(enforceRequestLimitAsync(request, "agent_user", "repo")).resolves.toBeUndefined();
  });
});
describe("script policy", () => {
  test("production allows nonced scripts without unsafe script execution", () => {
    const policy = contentSecurityPolicy("random-nonce");
    const script = policy.split(";").find((part) => part.trim().startsWith("script-src"))!;
    expect(script).toContain("'nonce-random-nonce'"); expect(script).toContain("'strict-dynamic'");
    expect(script).not.toContain("'unsafe-inline'"); expect(script).not.toContain("'unsafe-eval'");
    expect(policy).toContain("frame-ancestors 'none'"); expect(policy).toContain("object-src 'none'");
  });
});
