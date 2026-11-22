import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as realConfig from "@/lib/github-app/config";
import * as realSession from "@/lib/github-app/session";
import * as realUserAuth from "@/lib/github-app/user-auth";
import { githubInstallMetadataFromSession } from "@/lib/github-app/workos-metadata";
import { IngestError } from "@/lib/ingest/errors";
import type { GitHubAppSessionData } from "@/lib/github-app/types";

/**
 * COA-747: the GitHub connection must survive losing the gh-session cookie
 * (sign-out, 7-day expiry, new device, a rotated refresh token whose
 * response never reached the browser). WorkOS Vault holds the durable copy.
 */

const USER = "user_vault";
const binding: GitHubAppSessionData = {
  installationId: 100, accountLogin: "ada", accountType: "User", workosUserId: USER,
  connectedAt: "2026-10-01T00:00:00.000Z", permissions: "contents:read,metadata:read",
};

let metadata: Record<string, string> = {};
let cookie: GitHubAppSessionData | undefined;
let savedCookies: GitHubAppSessionData[] = [];
let vault: Map<string, { id: string; value: string }>;
let vaultDown = false;
let refreshImpl: (token: string) => Promise<realUserAuth.GitHubUserCredentials>;
let refreshCalls: string[] = [];

const env = {
  WORKOS_CLIENT_ID: "client_test", WORKOS_API_KEY: "sk_test", WORKOS_COOKIE_PASSWORD: "x".repeat(32),
  NEXT_PUBLIC_WORKOS_REDIRECT_URI: "http://localhost:3005/callback",
};
const previous: Record<string, string | undefined> = {};

function notFound(): Error {
  return Object.assign(new Error("not found"), { status: 404 });
}

mock.module("@/lib/github-app/config", () => ({ ...realConfig, isGitHubAppConfigured: () => true }));
mock.module("@/lib/github-app/session", () => ({
  ...realSession,
  readGitHubAppSessionForUser: async (id: string) => (cookie?.workosUserId === id ? cookie : undefined),
  saveGitHubAppSession: async (data: GitHubAppSessionData) => { savedCookies.push(data); cookie = data; },
  destroyGitHubAppSession: async () => { cookie = undefined; },
}));
mock.module("@/lib/github-app/user-auth", () => ({
  ...realUserAuth,
  refreshGitHubUserToken: (token: string) => { refreshCalls.push(token); return refreshImpl(token); },
  revokeGitHubUserGrant: async () => {},
}));
mock.module("@workos-inc/authkit-nextjs", () => ({ withAuth: async () => ({ user: { id: USER } }) }));
mock.module("@/lib/github-app/metadata-client", () => ({
  githubMetadataClient: () => ({
    userManagement: {
      getUser: async () => ({ metadata: { ...metadata } }),
      updateUser: async (data: { metadata: Record<string, string | null> }) => {
        for (const [key, value] of Object.entries(data.metadata)) {
          if (value === null) delete metadata[key]; else metadata[key] = value;
        }
        return { metadata: { ...metadata } };
      },
    },
    vault: {
      readObjectByName: async (name: string) => {
        if (vaultDown) throw Object.assign(new Error("down"), { status: 503 });
        const found = vault.get(name);
        if (!found) throw notFound();
        return { ...found };
      },
      createObject: async ({ name, value }: { name: string; value: string }) => {
        if (vaultDown) throw Object.assign(new Error("down"), { status: 503 });
        if (vault.has(name)) throw Object.assign(new Error("exists"), { status: 409 });
        vault.set(name, { id: `obj_${name}`, value });
        return { id: `obj_${name}` };
      },
      updateObject: async ({ id, value }: { id: string; value: string }) => {
        for (const [name, entry] of vault) if (entry.id === id) vault.set(name, { id, value });
        return {};
      },
      deleteObject: async ({ id }: { id: string }) => {
        for (const [name, entry] of vault) if (entry.id === id) vault.delete(name);
      },
    },
  }),
}));

const stored = () => {
  const entry = vault.get(`chronos-gh-user-${USER}`);
  return entry ? JSON.parse(entry.value) as Record<string, unknown> : undefined;
};

beforeEach(() => {
  for (const [key, value] of Object.entries(env)) { previous[key] = process.env[key]; process.env[key] = value; }
  metadata = { ...githubInstallMetadataFromSession(binding) };
  cookie = undefined;
  savedCookies = [];
  vault = new Map();
  vaultDown = false;
  refreshCalls = [];
  refreshImpl = async () => { throw new Error("unexpected refresh"); };
});
afterEach(() => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

describe("durable GitHub credentials (WorkOS Vault)", () => {
  test("after sign-out (no cookie) the connection resolves from Vault", async () => {
    const { storeGitHubCredentials } = await import("@/lib/github-app/credential-store");
    await storeGitHubCredentials(USER, {
      userAccessToken: "ghu_durable", userRefreshToken: "ghr_durable",
      userTokenExpiresAt: Date.now() + 3_600_000, authorizationVersion: "initial",
    });
    const { resolveGitHubAppSessionForUser } = await import("@/lib/github-app/resolve-session");
    const session = await resolveGitHubAppSessionForUser(USER);
    expect(session?.userAccessToken).toBe("ghu_durable");
    expect(session?.installationId).toBe(100);
  });

  test("an existing cookie-only connection is copied into Vault on first use", async () => {
    cookie = { ...binding, userAccessToken: "ghu_cookie", userRefreshToken: "ghr_cookie", userTokenExpiresAt: Date.now() + 3_600_000 };
    const { resolveGitHubAppSessionForUser } = await import("@/lib/github-app/resolve-session");
    expect((await resolveGitHubAppSessionForUser(USER))?.userAccessToken).toBe("ghu_cookie");
    expect(stored()?.userRefreshToken).toBe("ghr_cookie");
  });

  test("credentials issued before a disconnect (old version) are never used", async () => {
    const { storeGitHubCredentials } = await import("@/lib/github-app/credential-store");
    await storeGitHubCredentials(USER, { userAccessToken: "ghu_old", authorizationVersion: "initial" });
    metadata = { ...githubInstallMetadataFromSession({ ...binding, authorizationVersion: "v2" }), chronosGhVersion: "v2" };
    const { resolveGitHubAppSessionForUser } = await import("@/lib/github-app/resolve-session");
    const session = await resolveGitHubAppSessionForUser(USER);
    expect(session?.installationId).toBe(100);
    expect(session?.userAccessToken).toBeUndefined();
  });

  test("a refresh persists the rotated tokens to Vault before the cookie", async () => {
    refreshImpl = async () => ({ userAccessToken: "ghu_new", userRefreshToken: "ghr_new", userTokenExpiresAt: Date.now() + 28_800_000 });
    const { activeGitHubUserToken } = await import("@/lib/github-app/token");
    const token = await activeGitHubUserToken({
      ...binding, userAccessToken: "ghu_expired", userRefreshToken: "ghr_rotate_me", userTokenExpiresAt: Date.now() - 1,
    });
    expect(token).toBe("ghu_new");
    expect(stored()?.userRefreshToken).toBe("ghr_new");
    expect(savedCookies.at(-1)?.userRefreshToken).toBe("ghr_new");
  });

  test("a refresh token already rotated elsewhere adopts the successor from Vault", async () => {
    const { storeGitHubCredentials } = await import("@/lib/github-app/credential-store");
    await storeGitHubCredentials(USER, {
      userAccessToken: "ghu_successor", userRefreshToken: "ghr_successor",
      userTokenExpiresAt: Date.now() + 28_800_000, authorizationVersion: "initial",
    });
    refreshImpl = async () => {
      throw new IngestError("auth-refreshing", "GitHub authorization needs to be refreshed.", 1);
    };
    const { activeGitHubUserToken } = await import("@/lib/github-app/token");
    const token = await activeGitHubUserToken({
      ...binding, userAccessToken: "ghu_expired", userRefreshToken: "ghr_consumed", userTokenExpiresAt: Date.now() - 1,
    });
    expect(token).toBe("ghu_successor");
    expect(savedCookies.at(-1)?.userAccessToken).toBe("ghu_successor");
  });

  test("Vault being unavailable degrades to the cookie instead of failing", async () => {
    vaultDown = true;
    cookie = { ...binding, userAccessToken: "ghu_cookie", userRefreshToken: "ghr_cookie", userTokenExpiresAt: Date.now() + 3_600_000 };
    const { resolveGitHubAppSessionForUser } = await import("@/lib/github-app/resolve-session");
    expect((await resolveGitHubAppSessionForUser(USER))?.userAccessToken).toBe("ghu_cookie");
  });

  test("disconnect deletes the durable credentials, even without a cookie", async () => {
    const { storeGitHubCredentials } = await import("@/lib/github-app/credential-store");
    await storeGitHubCredentials(USER, {
      userAccessToken: "ghu_durable", userRefreshToken: "ghr_durable",
      userTokenExpiresAt: Date.now() + 3_600_000, authorizationVersion: "initial",
    });
    const { disconnectGitHubForUser } = await import("@/lib/github-app/disconnect");
    const result = await disconnectGitHubForUser(USER);
    expect(result.ok).toBe(true);
    expect(stored()).toBeUndefined();
  });
});
