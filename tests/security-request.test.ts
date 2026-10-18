import { describe, expect, test } from "bun:test";
import { enforceRequestLimit, isSameOriginMutation } from "@/lib/security/request";
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
describe("script policy", () => {
  test("production allows nonced scripts without unsafe script execution", () => {
    const policy = contentSecurityPolicy("random-nonce");
    const script = policy.split(";").find((part) => part.trim().startsWith("script-src"))!;
    expect(script).toContain("'nonce-random-nonce'"); expect(script).toContain("'strict-dynamic'");
    expect(script).not.toContain("'unsafe-inline'"); expect(script).not.toContain("'unsafe-eval'");
    expect(policy).toContain("frame-ancestors 'none'"); expect(policy).toContain("object-src 'none'");
  });
});
