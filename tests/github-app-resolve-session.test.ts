/**
 * Mocked resolve-session rehydrate — passthrough shared module exports.
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as realGitHubAppConfig from "@/lib/github-app/config";
import * as realInstall from "@/lib/github-app/install";

const workosUserId = "user_01REHYDRATE";
const metadataBinding = {
  installationId: 9001,
  accountLogin: "ada-lovelace",
  accountType: "User" as const,
  connectedAt: "2026-10-01T12:00:00.000Z",
  permissions: "contents:read,metadata:read",
};

let saveCalls = 0;
/** Simulates sealed gh-session (only returned when workosUserId matches). */
let cookieSession:
  | (typeof metadataBinding & { workosUserId: string })
  | undefined = undefined;
let metadataDisabled = false;

const AUTH_ENV = {
  WORKOS_CLIENT_ID: "client_test",
  WORKOS_API_KEY: "sk_test",
  WORKOS_COOKIE_PASSWORD: "x".repeat(32),
  NEXT_PUBLIC_WORKOS_REDIRECT_URI: "http://localhost:3005/callback",
} as const;

const savedAuthEnv: Partial<Record<keyof typeof AUTH_ENV, string | undefined>> = {};

beforeEach(() => {
  for (const key of Object.keys(AUTH_ENV) as (keyof typeof AUTH_ENV)[]) {
    savedAuthEnv[key] = process.env[key];
    process.env[key] = AUTH_ENV[key];
  }
});

mock.module("@/lib/github-app/config", () => ({
  ...realGitHubAppConfig,
  isGitHubAppConfigured: () => true,
}));

mock.module("@/lib/github-app/session", () => ({
  readGitHubAppSessionForUser: async (userId: string | null | undefined) => {
    if (!userId || !cookieSession) return undefined;
    return cookieSession.workosUserId === userId ? cookieSession : undefined;
  },
  saveGitHubAppSession: async () => {
    saveCalls += 1;
  },
}));

mock.module("@/lib/github-app/workos-metadata", () => ({
  readGitHubInstallMetadata: async (userId: string) => {
    if (metadataDisabled) return undefined;
    return userId === workosUserId ? metadataBinding : undefined;
  },
  writeGitHubInstallMetadata: async () => {},
  clearGitHubInstallMetadata: async () => {},
}));

mock.module("@/lib/github-app/install", () => ({
  ...realInstall,
  fetchInstallationAccount: async (installationId: number) => ({
    installationId,
    accountLogin: metadataBinding.accountLogin,
    accountType: metadataBinding.accountType,
  }),
}));

afterEach(() => {
  saveCalls = 0;
  cookieSession = undefined;
  metadataDisabled = false;
  for (const key of Object.keys(AUTH_ENV) as (keyof typeof AUTH_ENV)[]) {
    const value = savedAuthEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("resolveGitHubAppSessionForUser", () => {
  test("rehydrates from WorkOS metadata when gh-session is absent", async () => {
    const { resolveGitHubAppSessionForUser } = await import("@/lib/github-app/resolve-session");
    const session = await resolveGitHubAppSessionForUser(workosUserId);
    expect(session).toEqual({
      ...metadataBinding,
      workosUserId,
    });
  });

  test("does not seal gh-session without persistSession (RSC-safe default)", async () => {
    const { resolveGitHubAppSessionForUser } = await import("@/lib/github-app/resolve-session");
    const session = await resolveGitHubAppSessionForUser(workosUserId);
    expect(session?.installationId).toBe(metadataBinding.installationId);
    expect(saveCalls).toBe(0);
  });

  test("persistSession seals rehydrated gh-session (Route Handlers)", async () => {
    const { resolveGitHubAppSessionForUser } = await import("@/lib/github-app/resolve-session");
    await resolveGitHubAppSessionForUser(workosUserId, { persistSession: true });
    expect(saveCalls).toBe(1);
  });

  test("ignores gh-session sealed for another WorkOS user (fail closed)", async () => {
    cookieSession = {
      ...metadataBinding,
      installationId: 1111,
      accountLogin: "other-user",
      workosUserId: "user_01OTHER",
    };

    const { resolveGitHubAppSessionForUser } = await import("@/lib/github-app/resolve-session");
    expect(await resolveGitHubAppSessionForUser(workosUserId)).toEqual({
      ...metadataBinding,
      workosUserId,
    });
    expect(saveCalls).toBe(0);

    expect(await resolveGitHubAppSessionForUser("user_01STRANGER")).toBeUndefined();
    expect(saveCalls).toBe(0);
  });

  test("without metadata, resolve is disconnected after gh-session cleared", async () => {
    metadataDisabled = true;
    cookieSession = undefined;

    const { resolveGitHubAppSessionForUser } = await import("@/lib/github-app/resolve-session");
    expect(await resolveGitHubAppSessionForUser(workosUserId)).toBeUndefined();
    expect(saveCalls).toBe(0);
  });
});
