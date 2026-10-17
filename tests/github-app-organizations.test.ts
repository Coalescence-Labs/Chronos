import { afterEach, describe, expect, mock, test } from "bun:test";
import { mergeGitHubInstallation, githubInstallBindings } from "@/lib/github-app/bindings";
import type { GitHubAppSessionData } from "@/lib/github-app/types";
import * as realInstall from "@/lib/github-app/install";
import * as realSession from "@/lib/github-app/session";

const personal: GitHubAppSessionData = {
  installationId: 100, accountLogin: "ada", accountType: "User", workosUserId: "user_test",
  connectedAt: "2026-10-01T00:00:00.000Z", permissions: "contents:read,metadata:read",
  userAccessToken: "ghu_test_user",
};
const organization: GitHubAppSessionData = {
  ...personal, installationId: 200, accountLogin: "acme", accountType: "Organization",
  connectedAt: "2026-10-17T00:00:00.000Z",
};

let session: GitHubAppSessionData | undefined;
const minted: number[] = [];
const saved: GitHubAppSessionData[] = [];
const originalFetch = globalThis.fetch;

mock.module("@/lib/github-app/resolve-session", () => ({
  resolveGitHubAppSessionForUser: async (userId: string) => session?.workosUserId === userId ? session : undefined,
}));
mock.module("@/lib/github-app/install", () => ({
  ...realInstall,
  createInstallationAccessToken: async (id: number) => { minted.push(id); return `ghs_install_${id}`; },
}));
mock.module("@/lib/github-app/session", () => ({
  ...realSession,
  saveGitHubAppSession: async (data: GitHubAppSessionData) => { saved.push(data); },
}));

afterEach(() => {
  session = undefined;
  minted.length = 0;
  saved.length = 0;
  globalThis.fetch = originalFetch;
});

describe("multiple GitHub installations", () => {
  test("adding an organization preserves personal access and reconnect keeps the original date", () => {
    const connected = mergeGitHubInstallation(personal, organization);
    expect(githubInstallBindings(connected).map((binding) => binding.accountLogin)).toEqual(["acme", "ada"]);
    const reconnected = mergeGitHubInstallation(connected, { ...personal, connectedAt: "2026-10-18T00:00:00.000Z" });
    expect(reconnected.connectedAt).toBe(personal.connectedAt);
    expect(githubInstallBindings(reconnected)).toHaveLength(2);
  });

  test("a different Chronos user cannot inherit the previous user's installations", () => {
    const connected = mergeGitHubInstallation(personal, { ...organization, workosUserId: "user_other" });
    expect(githubInstallBindings(connected)).toHaveLength(1);
    expect(connected.accountLogin).toBe("acme");
  });

  test("owner matching is case-insensitive and both installations remain usable", async () => {
    session = mergeGitHubInstallation(personal, organization);
    const probes: string[] = [];
    globalThis.fetch = (async (input, init) => {
      probes.push(new URL(String(input)).pathname);
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer ghu_test_user");
      return Response.json({ default_branch: "main", private: true });
    }) as typeof fetch;
    const { resolveGitHubAccessToken } = await import("@/lib/github-app/token");
    expect(await resolveGitHubAccessToken("user_test", { owner: "ACME", repo: "private" })).toBe("ghs_install_200");
    expect(await resolveGitHubAccessToken("user_test", { owner: "ada", repo: "personal" })).toBe("ghs_install_100");
    expect(minted).toEqual([200, 100]);
    expect(probes).toEqual(["/repos/ACME/private", "/repos/ada/personal"]);
  });

  test("an organization member cannot read a repo that only the installation can access", async () => {
    session = mergeGitHubInstallation(personal, organization);
    globalThis.fetch = (async () => Response.json({}, { status: 404 })) as unknown as typeof fetch;
    const { resolveGitHubAccessToken } = await import("@/lib/github-app/token");
    await expect(resolveGitHubAccessToken("user_test", { owner: "acme", repo: "restricted" })).rejects.toMatchObject({ code: "not-found" });
    expect(minted).toEqual([]);
  });

  test("legacy bindings without GitHub user verification never mint a token", async () => {
    session = { ...personal, userAccessToken: undefined };
    const { resolveGitHubAccessToken } = await import("@/lib/github-app/token");
    await resolveGitHubAccessToken("user_test", { owner: "ada", repo: "private" });
    await resolveGitHubAccessToken("user_other", { owner: "ada", repo: "private" });
    expect(minted).toEqual([]);
  });

  test("an unrelated owner never receives another installation's token", async () => {
    session = mergeGitHubInstallation(personal, organization);
    const { resolveGitHubAccessToken } = await import("@/lib/github-app/token");
    await resolveGitHubAccessToken("user_test", { owner: "elsewhere", repo: "public" });
    expect(minted).toEqual([]);
  });

  test("expired user credentials refresh server-side before the repo permission check", async () => {
    session = { ...organization, userTokenExpiresAt: 1, userRefreshToken: "ghr_test_refresh" };
    const previousId = process.env.GITHUB_APP_CLIENT_ID;
    const previousSecret = process.env.GITHUB_APP_CLIENT_SECRET;
    process.env.GITHUB_APP_CLIENT_ID = "Iv1.test";
    process.env.GITHUB_APP_CLIENT_SECRET = "test-secret";
    globalThis.fetch = (async (input, init) => {
      if (String(input) === "https://github.com/login/oauth/access_token") {
        expect(JSON.parse(String(init?.body)).grant_type).toBe("refresh_token");
        return Response.json({ access_token: "ghu_refreshed", refresh_token: "ghr_rotated", expires_in: 28800 });
      }
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer ghu_refreshed");
      return Response.json({ default_branch: "main", private: true });
    }) as typeof fetch;
    try {
      const { resolveGitHubAccessToken } = await import("@/lib/github-app/token");
      expect(await resolveGitHubAccessToken("user_test", { owner: "acme", repo: "private" })).toBe("ghs_install_200");
      expect(saved[0]?.userAccessToken).toBe("ghu_refreshed");
      expect(saved[0]?.userRefreshToken).toBe("ghr_rotated");
    } finally {
      if (previousId === undefined) delete process.env.GITHUB_APP_CLIENT_ID;
      else process.env.GITHUB_APP_CLIENT_ID = previousId;
      if (previousSecret === undefined) delete process.env.GITHUB_APP_CLIENT_SECRET;
      else process.env.GITHUB_APP_CLIENT_SECRET = previousSecret;
    }
  });
});
