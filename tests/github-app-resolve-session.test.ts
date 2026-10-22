import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as config from "@/lib/github-app/config";
import type { GitHubAppSessionData } from "@/lib/github-app/types";

const binding = {
  installationId: 9001, accountLogin: "acme", accountType: "Organization" as const,
  connectedAt: "2026-10-01T12:00:00Z", permissions: "contents:read,metadata:read", authorizationVersion: "initial",
};
let cookie: GitHubAppSessionData | undefined;
let metadata: typeof binding | undefined;
let readFails = false;
let writes = 0;
mock.module("@/lib/auth/config", () => ({ isAuthConfigured: () => true }));
mock.module("@/lib/github-app/config", () => ({ ...config, isGitHubAppConfigured: () => true }));
mock.module("@/lib/github-app/session", () => ({
  readGitHubAppSessionForUser: async (id: string) => cookie?.workosUserId === id ? cookie : undefined,
  saveGitHubAppSession: async () => { writes++; },
}));
mock.module("@/lib/github-app/workos-metadata", () => ({
  INITIAL_GITHUB_AUTHORIZATION_VERSION: "initial",
  readGitHubInstallMetadata: async (id: string) => {
    if (readFails) throw new Error("WorkOS unavailable");
    return id === "user_test" ? metadata : undefined;
  },
}));
beforeEach(() => {
  cookie = { ...binding, workosUserId: "user_test", userAccessToken: "ghu_fake" };
  metadata = { ...binding }; readFails = false; writes = 0;
});
afterEach(() => { cookie = undefined; metadata = undefined; });

describe("authoritative GitHub connection resolution", () => {
  test("a cookie alone cannot revive a disconnected organization", async () => {
    metadata = undefined;
    const { resolveGitHubAppSessionForUser } = await import("@/lib/github-app/resolve-session");
    expect(await resolveGitHubAppSessionForUser("user_test")).toBeUndefined();
  });
  test("old credentials cannot cross a disconnect-and-reconnect boundary", async () => {
    metadata = { ...binding, authorizationVersion: "new-version" };
    const { resolveGitHubAppSessionForUser } = await import("@/lib/github-app/resolve-session");
    await expect(resolveGitHubAppSessionForUser("user_test")).rejects.toMatchObject({ code: "reconnect-required" });
  });
  test("provider outage fails closed without deleting or overwriting credentials", async () => {
    readFails = true;
    const { resolveGitHubAppSessionForUser } = await import("@/lib/github-app/resolve-session");
    await expect(resolveGitHubAppSessionForUser("user_test")).rejects.toThrow("WorkOS unavailable");
    expect(writes).toBe(0); expect(cookie?.userAccessToken).toBe("ghu_fake");
  });
  test("metadata-only sign-in requires user verification without sealing a credential-free cookie", async () => {
    cookie = undefined;
    const { resolveGitHubAppSessionForUser } = await import("@/lib/github-app/resolve-session");
    const result = await resolveGitHubAppSessionForUser("user_test");
    expect(result?.installationId).toBe(9001); expect(result?.userAccessToken).toBeUndefined();
    expect(writes).toBe(0);
  });
  test("another WorkOS user never inherits credentials or bindings", async () => {
    const { resolveGitHubAppSessionForUser } = await import("@/lib/github-app/resolve-session");
    expect(await resolveGitHubAppSessionForUser("other_user")).toBeUndefined();
    expect(await resolveGitHubAppSessionForUser(null)).toBeUndefined();
  });
  test("durable account changes supersede stale cookie bindings", async () => {
    metadata = { ...binding, accountLogin: "renamed-acme" };
    const { resolveGitHubAppSessionForUser } = await import("@/lib/github-app/resolve-session");
    const result = await resolveGitHubAppSessionForUser("user_test");
    expect(result?.accountLogin).toBe("renamed-acme"); expect(result?.userAccessToken).toBe("ghu_fake");
  });
});
