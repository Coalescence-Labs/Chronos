import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as realGitHubApp from "@/lib/github-app";
import type { GitHubAppSessionData } from "@/lib/github-app/types";
import { GITHUB_COOKIE_POSTURE } from "@/lib/github-app/config";
import { readGitHubConnectState, sealGitHubConnectState } from "@/lib/github-app/user-auth";

const personal: GitHubAppSessionData = {
  installationId: 100, accountLogin: "ada", accountType: "User", workosUserId: "user_test",
  connectedAt: "2026-10-01T00:00:00.000Z", permissions: "contents:read,metadata:read",
};
let activeUser = "user_test";
let accessibleId = 200;
const jar = new Map<string, string>();
const writes: GitHubAppSessionData[] = [];
const saves: GitHubAppSessionData[] = [];
const originalFetch = globalThis.fetch;
const env = {
  WORKOS_CLIENT_ID: "client_test", WORKOS_API_KEY: "sk_test", WORKOS_COOKIE_PASSWORD: "x".repeat(32),
  NEXT_PUBLIC_WORKOS_REDIRECT_URI: "http://localhost:3005/callback",
  GITHUB_SESSION_PASSWORD: "x".repeat(32), GITHUB_APP_CLIENT_ID: "Iv1.test", GITHUB_APP_CLIENT_SECRET: "test-secret",
};
const previous: Record<string, string | undefined> = {};

mock.module("next/headers", () => ({ cookies: async () => ({
  get: (key: string) => jar.has(key) ? { value: jar.get(key)! } : undefined,
  set: (key: string, value: string) => { jar.set(key, value); },
  delete: (key: string) => { jar.delete(key); },
}) }));
mock.module("@workos-inc/authkit-nextjs", () => ({ withAuth: async () => ({ user: { id: activeUser } }) }));
mock.module("@/lib/github-app", () => ({
  ...realGitHubApp,
  isGitHubAppConfigured: () => true,
  peekGitHubInstallBinding: async () => personal,
  fetchInstallationAccount: async (id: number) => ({ installationId: id, accountLogin: "acme", accountType: "Organization" }),
  writeGitHubInstallMetadata: async (_id: string, data: GitHubAppSessionData) => { writes.push(data); },
  saveGitHubAppSession: async (data: GitHubAppSessionData) => { saves.push(data); },
}));

beforeEach(() => {
  for (const [key, value] of Object.entries(env)) { previous[key] = process.env[key]; process.env[key] = value; }
  globalThis.fetch = (async (input) => String(input).startsWith("https://github.com/login/oauth/access_token")
    ? Response.json({ access_token: "ghu_test_user", refresh_token: "ghr_test_refresh", expires_in: 28800 })
    : Response.json({ installations: [{ id: accessibleId }] })) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  jar.clear(); writes.length = 0; saves.length = 0;
  activeUser = "user_test"; accessibleId = 200;
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

async function startInstall(installationId = 200, workosUserId = "user_test") {
  jar.set(GITHUB_COOKIE_POSTURE.stateCookieName, await sealGitHubConnectState({
    state: "install-state", workosUserId, stage: "install", redirectUri: "https://chronos.test/api/github/callback",
  }));
  const { GET } = await import("@/app/api/github/callback/route");
  return GET(new Request(`https://chronos.test/api/github/callback?installation_id=${installationId}&state=install-state`));
}

describe("verified organization connect callback", () => {
  test("verifies the GitHub user before saving, then keeps the personal installation", async () => {
    const install = await startInstall();
    const authorize = new URL(install.headers.get("location")!);
    expect(authorize.pathname).toBe("/login/oauth/authorize");
    expect(writes).toEqual([]);
    const pending = await readGitHubConnectState(jar.get(GITHUB_COOKIE_POSTURE.stateCookieName));
    expect(pending.workosUserId).toBe("user_test");
    expect(pending.installationId).toBe(200);
    const { GET } = await import("@/app/api/github/callback/route");
    const result = await GET(new Request(`https://chronos.test/api/github/callback?code=test-code&state=${pending.state}`));
    expect(new URL(result.headers.get("location")!).searchParams.get("github")).toBe("connected");
    expect(writes[0]?.accountLogin).toBe("acme");
    expect(writes[0]?.additionalInstallations?.[0]?.installationId).toBe(100);
    expect(saves[0]?.userAccessToken).toBe("ghu_test_user");
    expect(jar.has(GITHUB_COOKIE_POSTURE.stateCookieName)).toBe(false);
  });

  test("a forged installation id cannot create a connection", async () => {
    await startInstall(999);
    const pending = await readGitHubConnectState(jar.get(GITHUB_COOKIE_POSTURE.stateCookieName));
    const { GET } = await import("@/app/api/github/callback/route");
    const result = await GET(new Request(`https://chronos.test/api/github/callback?code=test-code&state=${pending.state}`));
    expect(new URL(result.headers.get("location")!).searchParams.get("github")).toBe("error");
    expect(writes).toEqual([]);
    expect(saves).toEqual([]);
  });

  test("switching Chronos accounts invalidates pending connect state", async () => {
    const result = await startInstall(200, "user_other");
    expect(new URL(result.headers.get("location")!).searchParams.get("github")).toBe("error");
    expect(writes).toEqual([]);
  });

  test("an organization approval request preserves the existing connection", async () => {
    jar.set(GITHUB_COOKIE_POSTURE.stateCookieName, await sealGitHubConnectState({
      state: "request-state", workosUserId: "user_test", stage: "install", redirectUri: "https://chronos.test/api/github/callback",
    }));
    const { GET } = await import("@/app/api/github/callback/route");
    const result = await GET(new Request("https://chronos.test/api/github/callback?setup_action=request&state=request-state"));
    expect(new URL(result.headers.get("location")!).searchParams.get("github")).toBe("pending");
    expect(writes).toEqual([]);
    expect(saves).toEqual([]);
  });
});
