import { afterEach, describe, expect, test } from "bun:test";
import { isAuthConfigured, workosRedirectUri } from "@/lib/auth";

const ENV_KEYS = [
  "WORKOS_CLIENT_ID",
  "WORKOS_API_KEY",
  "WORKOS_COOKIE_PASSWORD",
  "NEXT_PUBLIC_WORKOS_REDIRECT_URI",
] as const;

const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

function snapshotEnv() {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
  }
}

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function clearAuthEnv() {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

afterEach(() => {
  restoreEnv();
});

describe("optional WorkOS auth gate", () => {
  test("isAuthConfigured is false with no WorkOS env", () => {
    snapshotEnv();
    clearAuthEnv();
    expect(isAuthConfigured()).toBe(false);
    expect(workosRedirectUri()).toBeUndefined();
  });

  test("isAuthConfigured rejects short cookie password", () => {
    snapshotEnv();
    process.env.WORKOS_CLIENT_ID = "client_test";
    process.env.WORKOS_API_KEY = "sk_test";
    process.env.WORKOS_COOKIE_PASSWORD = "too-short";
    process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI = "http://localhost:3005/callback";
    expect(isAuthConfigured()).toBe(false);
  });

  test("isAuthConfigured true when all required vars present", () => {
    snapshotEnv();
    process.env.WORKOS_CLIENT_ID = "client_test";
    process.env.WORKOS_API_KEY = "sk_test";
    process.env.WORKOS_COOKIE_PASSWORD = "x".repeat(32);
    process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI = "http://localhost:3005/callback";
    expect(isAuthConfigured()).toBe(true);
    expect(workosRedirectUri()).toBe("http://localhost:3005/callback");
  });

  test("proxy.ts gates AuthKit behind isAuthConfigured / createAuthProxyHandler", async () => {
    const proxySource = await Bun.file("proxy.ts").text();
    expect(proxySource).toContain("createAuthProxyHandler");
    expect(proxySource).not.toMatch(/export default authkitProxy\s*\(/);

    const handlerSource = await Bun.file("lib/auth/proxy-handler.ts").text();
    expect(handlerSource).toContain("isAuthConfigured");
    expect(handlerSource).toContain("NextResponse.next");
    expect(handlerSource).toContain("eagerAuth: false");
    expect(handlerSource).toContain("redirectUri:");
    expect(handlerSource).toContain("workosRedirectUri");
  });

  test("proxy handler no-ops before authkitProxy when unconfigured", async () => {
    const handlerSource = await Bun.file("lib/auth/proxy-handler.ts").text();
    // Gate must run before any authkit invocation — order matters for the throw.
    const gateIdx = handlerSource.indexOf("if (!isAuthConfigured())");
    const nextIdx = handlerSource.indexOf("NextResponse.next()");
    const authkitCallIdx = handlerSource.indexOf("authkitProxy({");
    expect(gateIdx).toBeGreaterThan(-1);
    expect(nextIdx).toBeGreaterThan(gateIdx);
    expect(authkitCallIdx).toBeGreaterThan(nextIdx);
  });
});
