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
let readFails = false;
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
}));
mock.module("@/lib/github-app/metadata-client", () => ({
  githubMetadataClient: () => ({ userManagement: {
    getUser: async () => { if (readFails) throw new Error("WorkOS unavailable"); return { metadata: { ...metadata } }; },
    updateUser: async (data: { metadata: Record<string, string | null> }) => {
      updateCalls++;
      if (writeFails) throw new Error("WorkOS unavailable");
      expect(Object.keys(data.metadata).length).toBeLessThanOrEqual(10);
      for (const [key, value] of Object.entries(data.metadata)) {
        if (value === null) delete metadata[key]; else metadata[key] = value;
      }
      expect(Object.keys(metadata).length).toBeLessThanOrEqual(10);
      return { metadata: { ...metadata } };
    },
  } }),
}));

beforeEach(() => {
  for (const [key, value] of Object.entries(env)) { previous[key] = process.env[key]; process.env[key] = value; }
  metadata = { ...githubInstallMetadataFromSession(binding), unrelated: "keep" };
});
afterEach(() => {
  metadata = {}; updateCalls = 0; destroyCalls = 0; writeFails = false; readFails = false; uninstalled.length = 0;
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

describe("multiple install persistence and disconnect", () => {
  test("concurrent additions preserve both organizations and every prior binding", async () => {
    await Promise.all([300, 400].map((id) => writeGitHubInstallMetadata("user_test", {
      ...binding, installationId: id, accountLogin: `org-${id}`, accountType: "Organization", additionalInstallations: undefined,
    })));
    expect(Object.keys(metadata).sort()).toEqual(["chronosGhInstall_100", "chronosGhInstall_200", "chronosGhInstall_300", "chronosGhInstall_400", "unrelated"]);
  });

  test("failed reads cannot be mistaken for an empty account", async () => {
    readFails = true;
    const before = { ...metadata };
    const { peekGitHubInstallBinding } = await import("@/lib/github-app/resolve-session");
    await expect(peekGitHubInstallBinding("user_test")).rejects.toThrow("WorkOS unavailable");
    expect(metadata).toEqual(before); expect(updateCalls).toBe(0);
  });

  test("a stale callback cannot write after disconnect rotates the authorization version", async () => {
    await clearGitHubInstallMetadata("user_test");
    await expect(writeGitHubInstallMetadata("user_test", binding)).rejects.toMatchObject({ code: "reconnect-required" });
    expect(parseGitHubInstallMetadata(metadata)).toBeUndefined();
  });

  test("legacy accounts at the ten-key limit disconnect within provider limits", async () => {
    metadata = Object.fromEntries(Array.from({ length: 10 }, (_, index) =>
      Object.entries(githubInstallMetadataFromSession({ ...binding, installationId: index + 1, additionalInstallations: undefined }))[0]!));
    await clearGitHubInstallMetadata("user_test");
    expect(Object.keys(metadata)).toEqual(["chronosGhVersion"]);
    expect(parseGitHubInstallMetadata(metadata)).toBeUndefined();
  });
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

  test("adding an organization migrates a legacy personal connection that is absent from the incoming patch", async () => {
    metadata = {
      chronosGhInstallationId: "100", chronosGhAccountLogin: "ada", chronosGhAccountType: "User",
      chronosGhConnectedAt: binding.connectedAt, chronosGhPermissions: binding.permissions, unrelated: "keep",
    };
    await Promise.all([200, 300].map((installationId) => writeGitHubInstallMetadata("user_test", {
      ...binding, installationId, accountLogin: `org-${installationId}`, accountType: "Organization", additionalInstallations: undefined,
    })));
    expect(Object.keys(metadata).sort()).toEqual(["chronosGhInstall_100", "chronosGhInstall_200", "chronosGhInstall_300", "unrelated"]);
    const saved = parseGitHubInstallMetadata(metadata)!;
    expect(saved.accountLogin).toBe("ada");
    expect(saved.connectedAt).toBe(binding.connectedAt);
    expect(saved.additionalInstallations).toHaveLength(2);
  });

  test("migrating leftover legacy keys cannot overwrite a newer binding", async () => {
    metadata = {
      ...metadata,
      chronosGhInstallationId: "100", chronosGhAccountLogin: "old-name", chronosGhAccountType: "User",
      chronosGhConnectedAt: "2025-01-01T00:00:00Z", chronosGhPermissions: binding.permissions,
    };
    await writeGitHubInstallMetadata("user_test", {
      ...binding, installationId: 300, accountLogin: "third", accountType: "Organization", additionalInstallations: undefined,
    });
    expect(parseGitHubInstallMetadata(metadata)?.accountLogin).toBe("ada");
    expect(metadata.chronosGhInstallationId).toBeUndefined();
  });

  test("legacy bindings left behind after revocation cannot reappear during reconnect", async () => {
    metadata = {
      chronosGhVersion: "revoked-version", unrelated: "keep",
      chronosGhInstallationId: "100", chronosGhAccountLogin: "ada", chronosGhAccountType: "User",
      chronosGhConnectedAt: binding.connectedAt, chronosGhPermissions: binding.permissions,
    };
    await writeGitHubInstallMetadata("user_test", {
      ...binding, installationId: 200, accountLogin: "acme", accountType: "Organization",
      authorizationVersion: "revoked-version", additionalInstallations: undefined,
    });
    expect(Object.keys(metadata).sort()).toEqual(["chronosGhInstall_200", "chronosGhVersion", "unrelated"]);
    expect(parseGitHubInstallMetadata(metadata)?.installationId).toBe(200);
  });

  test("metadata capacity failure leaves existing connections intact", async () => {
    metadata = Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`other${index}`, "keep"]));
    const before = { ...metadata };
    await expect(writeGitHubInstallMetadata("user_test", binding)).rejects.toMatchObject({ code: "too-large" });
    expect(metadata).toEqual(before);
    expect(updateCalls).toBe(0);
  });

  test("clear removes all installation keys while retaining unrelated metadata", async () => {
    await clearGitHubInstallMetadata("user_test");
    expect(Object.keys(metadata).sort()).toEqual(["chronosGhVersion", "unrelated"]);
  });

  test("disconnect never uninstalls an installation shared with other people", async () => {
    const { POST } = await import("@/app/api/github/disconnect/route");
    expect((await POST(new Request("https://chronos.test/api/github/disconnect", { method: "POST", headers: { origin: "https://chronos.test" } }))).status).toBe(200);
    expect(uninstalled).toEqual([]);
    expect(Object.keys(metadata).sort()).toEqual(["chronosGhVersion", "unrelated"]);
    expect(destroyCalls).toBe(1);
  });

  test("disconnect still destroys sealed credentials when WorkOS cannot clear metadata", async () => {
    writeFails = true;
    const { POST } = await import("@/app/api/github/disconnect/route");
    expect((await POST(new Request("https://chronos.test/api/github/disconnect", { method: "POST", headers: { origin: "https://chronos.test" } }))).status).toBe(503);
    expect(destroyCalls).toBe(1);
    expect(uninstalled).not.toContain(200);
  });
});
