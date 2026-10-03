import { describe, expect, test } from "bun:test";
import {
  GITHUB_INSTALL_METADATA_KEYS,
  githubInstallMetadataFromSession,
  parseGitHubInstallMetadata,
} from "@/lib/github-app/workos-metadata";

const sampleSession = {
  installationId: 4242,
  accountLogin: "ada-lovelace",
  accountType: "User" as const,
  workosUserId: "user_01TEST",
  connectedAt: "2026-10-01T12:00:00.000Z",
  permissions: "contents:read,metadata:read",
};

describe("GitHub install WorkOS metadata", () => {
  test("serialize and parse round-trip with five chronosGh keys", () => {
    const serialized = githubInstallMetadataFromSession(sampleSession);
    expect(Object.keys(serialized)).toHaveLength(5);
    for (const key of Object.values(GITHUB_INSTALL_METADATA_KEYS)) {
      expect(key.length).toBeLessThanOrEqual(40);
      const value = serialized[key];
      expect(value).toBeDefined();
      expect(value!.length).toBeLessThanOrEqual(600);
    }
    expect(parseGitHubInstallMetadata(serialized)).toEqual({
      installationId: sampleSession.installationId,
      accountLogin: sampleSession.accountLogin,
      accountType: sampleSession.accountType,
      connectedAt: sampleSession.connectedAt,
      permissions: sampleSession.permissions,
    });
  });

  test("parse rejects incomplete metadata", () => {
    expect(parseGitHubInstallMetadata(undefined)).toBeUndefined();
    expect(
      parseGitHubInstallMetadata({
        [GITHUB_INSTALL_METADATA_KEYS.installationId]: "1",
      }),
    ).toBeUndefined();
  });
});

describe("rehydrate and WorkOS API wiring", () => {
  test("resolve-session rehydrates from metadata and clears revoked installs", async () => {
    const source = await Bun.file("lib/github-app/resolve-session.ts").text();
    expect(source).toContain("readGitHubInstallMetadata");
    expect(source).toContain("fetchInstallationAccount");
    expect(source).toContain("saveGitHubAppSession");
    expect(source).toContain("persistSession");
    expect(source).toContain("clearGitHubInstallMetadata");
    expect(source).toContain("GitHubInstallationReadError");
    expect(source).toMatch(/error\.status\s*===\s*404/);
  });

  test("workos-metadata write/clear use updateUser with string or null values", async () => {
    const source = await Bun.file("lib/github-app/workos-metadata.ts").text();
    expect(source).toContain("userManagement.updateUser");
    expect(source).toContain("githubInstallMetadataFromSession");
    expect(source).toMatch(/:\s*null/);
    expect(source).toContain("metadataWritePersisted");
    expect(source).toContain("did not persist on WorkOS user");
  });

  test("account GitHub card uses warm cookie or status API rehydrate", async () => {
    const page = await Bun.file("app/account/page.tsx").text();
    expect(page).toContain("AccountGitHubConnection");
    expect(page).not.toContain("Suspense");
    expect(page).not.toContain("GitHubConnectionCardPending");

    const card = await Bun.file("components/auth/AccountGitHubConnection.tsx").text();
    expect(card).toContain("readGitHubAppSessionForUser");
    expect(card).toContain("peekGitHubInstallBinding");
    expect(card).toContain("AccountGitHubConnectionRehydrate");
    expect(card).not.toContain("resolveGitHubAppSessionForUser");

    const rehydrate = await Bun.file(
      "components/auth/AccountGitHubConnectionRehydrate.tsx",
    ).text();
    expect(rehydrate).toContain("/api/github/status");
    expect(rehydrate).toContain("GitHubConnectionCardPending");
  });
});

describe("sign-out vs disconnect semantics", () => {
  test("sign-out clears gh-session but does not touch WorkOS metadata", async () => {
    const signOutSource = await Bun.file("lib/auth/sign-out.ts").text();
    expect(signOutSource).toContain("destroyGitHubAppSession");
    expect(signOutSource).not.toContain("clearGitHubInstallMetadata");
    expect(signOutSource).not.toContain("writeGitHubInstallMetadata");
  });

  test("disconnect clears metadata and uninstalls", async () => {
    const disconnectRoute = await Bun.file("app/api/github/disconnect/route.ts").text();
    const disconnectAction = await Bun.file("lib/github-app/actions.ts").text();
    for (const source of [disconnectRoute, disconnectAction]) {
      expect(source).toContain("clearGitHubInstallMetadata");
      expect(source).toContain("deleteInstallation");
      expect(source).toContain("destroyGitHubAppSession");
    }
  });

  test("callback writes metadata on connect", async () => {
    const callback = await Bun.file("app/api/github/callback/route.ts").text();
    expect(callback).toContain("writeGitHubInstallMetadata");
    expect(callback).toContain("saveGitHubAppSession");
  });
});
