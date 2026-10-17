import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as realConfig from "@/lib/github-app/config";
import * as realInstall from "@/lib/github-app/install";
import * as realSession from "@/lib/github-app/session";
import {
  clearGitHubInstallMetadata,
  githubInstallMetadataFromSession,
  parseGitHubInstallMetadata,
  writeGitHubInstallMetadata,
} from "@/lib/github-app/workos-metadata";
import type { GitHubAppSessionData } from "@/lib/github-app/types";

const binding: GitHubAppSessionData = {
  installationId: 100, accountLogin: "ada", accountType: "User", workosUserId: "user_test",
  connectedAt: "2026-10-01T00:00:00.000Z", permissions: "contents:read,metadata:read",
  userAccessToken: "ghu_secret", userRefreshToken: "ghr_secret",
  additionalInstallations: [{
    installationId: 200, accountLogin: "acme", accountType: "Organization",
    connectedAt: "2026-10-17T00:00:00.000Z", permissions: "contents:read,metadata:read",
  }],
};
let metadata: Record<string, string> = {};
let updateCalls = 0;
let destroyCalls = 0;
let writeFails = false;
const uninstalled: number[] = [];
const env = {
  WORKOS_CLIENT_ID: "client_test", WORKOS_API_KEY: "sk_test", WORKOS_COOKIE_PASSWORD: "x".repeat(32),
  NEXT_PUBLIC_WORKOS_REDIRECT_URI: "http://localhost:3005/callback",
};
const previous: Record<string, string | undefined> = {};

mock.module("@/lib/github-app/config", () => ({ ...realConfig, isGitHubAppConfigured: () => true }));
mock.module("@/lib/github-app/install", () => ({
  ...realInstall,
  deleteInstallation: async (id: number) => { uninstalled.push(id); return true; },
}));
mock.module("@/lib/github-app/session", () => ({
  ...realSession,
  readGitHubAppSessionForUser: async () => undefined,
  destroyGitHubAppSession: async () => { destroyCalls++; },
}));
mock.module("@workos-inc/authkit-nextjs", () => ({
  withAuth: async () => ({ user: { id: "user_test" } }),
  getWorkOS: () => ({ userManagement: {
    getUser: async () => ({ metadata: { ...metadata } }),
    updateUser: async (data: { metadata: Record<string, string | null> }) => {
      updateCalls++;
      if (writeFails) throw new Error("WorkOS unavailable");
      for (const [key, value] of Object.entries(data.metadata)) {
        if (value === null) delete metadata[key]; else metadata[key] = value;
      }
      return { metadata: { ...metadata } };
    },
  } }),
}));

beforeEach(() => {
  for (const [key, value] of Object.entries(env)) { previous[key] = process.env[key]; process.env[key] = value; }
  metadata = { ...githubInstallMetadataFromSession(binding), unrelated: "keep" };
});
afterEach(() => {
  metadata = {}; updateCalls = 0; destroyCalls = 0; writeFails = false; uninstalled.length = 0;
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

describe("multiple install persistence and disconnect", () => {
  test("write migrates legacy metadata, preserves unrelated fields, and excludes credentials", async () => {
    metadata = {
      chronosGhInstallationId: "100", chronosGhAccountLogin: "ada", chronosGhAccountType: "User",
      chronosGhConnectedAt: binding.connectedAt, chronosGhPermissions: binding.permissions, unrelated: "keep",
    };
    await writeGitHubInstallMetadata("user_test", binding);
    expect(Object.keys(metadata)).toHaveLength(3);
    expect(metadata.unrelated).toBe("keep");
    expect(metadata.chronosGhInstallationId).toBeUndefined();
    expect(parseGitHubInstallMetadata(metadata)?.additionalInstallations).toHaveLength(1);
    expect(JSON.stringify(metadata)).not.toMatch(/ghu_|ghr_|userAccessToken|userRefreshToken/);
  });

  test("metadata capacity failure leaves existing connections intact", async () => {
    metadata = Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`other${index}`, "keep"]));
    const before = { ...metadata };
    await expect(writeGitHubInstallMetadata("user_test", binding)).rejects.toThrow(/capacity/);
    expect(metadata).toEqual(before);
    expect(updateCalls).toBe(0);
  });

  test("clear removes all installation keys while retaining unrelated metadata", async () => {
    await clearGitHubInstallMetadata("user_test");
    expect(metadata).toEqual({ unrelated: "keep" });
  });

  test("disconnect never uninstalls an organization shared with other members", async () => {
    const { POST } = await import("@/app/api/github/disconnect/route");
    expect((await POST()).status).toBe(200);
    expect(uninstalled).toEqual([100]);
    expect(metadata).toEqual({ unrelated: "keep" });
    expect(destroyCalls).toBe(1);
  });

  test("disconnect still destroys sealed credentials when WorkOS cannot clear metadata", async () => {
    writeFails = true;
    const { POST } = await import("@/app/api/github/disconnect/route");
    await expect(POST()).rejects.toThrow("WorkOS unavailable");
    expect(destroyCalls).toBe(1);
    expect(uninstalled).not.toContain(200);
  });
});
