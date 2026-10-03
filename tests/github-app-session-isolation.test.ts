/**
 * Mocked GitHub session + sign-out flush — keep passthrough exports on shared
 * modules so mock.module does not break other suites in the full test run.
 */
import { afterEach, describe, expect, mock, test } from "bun:test";
import * as realGitHubAppConfig from "@/lib/github-app/config";
import type { GitHubAppSessionData } from "@/lib/github-app/types";

const userA = "user_01ALICE";
const userB = "user_01BOB";

const deletedCookieNames: string[] = [];

const sessionPayload: Partial<GitHubAppSessionData> & {
  destroy: () => void;
  save: () => Promise<void>;
} = {
  installationId: 4242,
  accountLogin: "alice-org",
  accountType: "User",
  workosUserId: userA,
  connectedAt: "2026-10-01T12:00:00.000Z",
  permissions: "contents:read,metadata:read",
  destroy() {
    delete sessionPayload.installationId;
    delete sessionPayload.accountLogin;
    delete sessionPayload.workosUserId;
    delete sessionPayload.accountType;
    delete sessionPayload.connectedAt;
    delete sessionPayload.permissions;
  },
  save: async () => {},
};

mock.module("next/headers", () => ({
  cookies: async () => ({
    delete: (opts: { name: string } | string) => {
      deletedCookieNames.push(typeof opts === "string" ? opts : opts.name);
    },
    getAll: () => [{ name: "wos-auth-verifier-test" }],
  }),
  headers: async () =>
    new Headers({
      host: "localhost:3005",
      "x-forwarded-proto": "http",
    }),
}));

mock.module("@/lib/github-app/config", () => ({
  ...realGitHubAppConfig,
  isGitHubAppConfigured: () => true,
  githubSessionPassword: () => "test-github-session-password-32chars",
}));

mock.module("iron-session", () => ({
  getIronSession: async () => sessionPayload,
}));

afterEach(() => {
  sessionPayload.installationId = 4242;
  sessionPayload.accountLogin = "alice-org";
  sessionPayload.accountType = "User";
  sessionPayload.workosUserId = userA;
  sessionPayload.connectedAt = "2026-10-01T12:00:00.000Z";
  sessionPayload.permissions = "contents:read,metadata:read";
  deletedCookieNames.length = 0;
});

describe("readGitHubAppSessionForUser (shared browser)", () => {
  test("returns session only when workosUserId matches sealed cookie", async () => {
    const { readGitHubAppSessionForUser } = await import("@/lib/github-app/session");
    const forA = await readGitHubAppSessionForUser(userA);
    expect(forA?.installationId).toBe(4242);
    expect(forA?.accountLogin).toBe("alice-org");

    expect(await readGitHubAppSessionForUser(userB)).toBeUndefined();
    expect(await readGitHubAppSessionForUser(null)).toBeUndefined();
  });

  test("after destroyGitHubAppSession, read fails closed for every user", async () => {
    const { destroyGitHubAppSession, readGitHubAppSessionForUser } = await import(
      "@/lib/github-app/session"
    );
    await destroyGitHubAppSession();
    expect(await readGitHubAppSessionForUser(userA)).toBeUndefined();
    expect(await readGitHubAppSessionForUser(userB)).toBeUndefined();
  });
});

describe("chronosSignOut runtime flush", () => {
  test("clears wos-session, PKCE verifier cookies, and destroys gh-session", async () => {
    const { chronosSignOut } = await import("@/lib/auth/sign-out");
    await expect(chronosSignOut("/account")).rejects.toThrow(/REDIRECT/);

    expect(deletedCookieNames).toContain("wos-session");
    expect(
      deletedCookieNames.some((name) => name.startsWith("wos-auth-verifier")),
    ).toBe(true);
    expect(sessionPayload.installationId).toBeUndefined();
  });

  test("does not clear WorkOS GitHub install metadata", async () => {
    const source = await Bun.file("lib/auth/sign-out.ts").text();
    expect(source).not.toContain("clearGitHubInstallMetadata");
    expect(source).not.toContain("writeGitHubInstallMetadata");
    expect(source).not.toContain("readGitHubInstallMetadata");
  });
});
