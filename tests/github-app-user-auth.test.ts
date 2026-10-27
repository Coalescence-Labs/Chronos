import { afterEach, describe, expect, test } from "bun:test";
import {
  assertGitHubUserInstallation,
  buildGitHubUserAuthorizeUrl,
  exchangeGitHubUserCode,
  readGitHubConnectState,
  sealGitHubConnectState,
  verifiedGitHubUserInstallations,
} from "@/lib/github-app/user-auth";

const originalFetch = globalThis.fetch;
const savedEnv = {
  GITHUB_APP_CLIENT_ID: process.env.GITHUB_APP_CLIENT_ID,
  GITHUB_APP_CLIENT_SECRET: process.env.GITHUB_APP_CLIENT_SECRET,
  GITHUB_SESSION_PASSWORD: process.env.GITHUB_SESSION_PASSWORD,
};
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("GitHub user verification", () => {
  test("pending connect state is encrypted and binds the stage, Chronos user and installation", async () => {
    process.env.GITHUB_SESSION_PASSWORD = "x".repeat(32);
    const pending = {
      state: "random-state", workosUserId: "user_test", stage: "authorize" as const,
      installationId: 123, redirectUri: "https://chronos.test/api/github/callback",
    };
    const sealed = await sealGitHubConnectState(pending);
    expect(sealed).not.toContain("user_test");
    expect(await readGitHubConnectState(sealed)).toEqual(pending);
    expect(await readGitHubConnectState("forged-state")).toEqual({});
    expect(await readGitHubConnectState(undefined)).toEqual({});
  });

  test("authorization URL uses GitHub App credentials and never asks for OAuth App scopes", () => {
    process.env.GITHUB_APP_CLIENT_ID = "Iv1.test";
    const url = new URL(buildGitHubUserAuthorizeUrl({
      state: "random", workosUserId: "user_test", stage: "authorize",
      redirectUri: "https://chronos.test/api/github/callback",
    }));
    expect(url.origin).toBe("https://github.com");
    expect(url.searchParams.get("client_id")).toBe("Iv1.test");
    expect(url.searchParams.get("scope")).toBe("offline_access");
    expect(url.searchParams.has("client_secret")).toBe(false);
  });

  test("code exchange puts secrets in a POST body and keeps user credentials server-side", async () => {
    process.env.GITHUB_APP_CLIENT_ID = "Iv1.test";
    process.env.GITHUB_APP_CLIENT_SECRET = "test-secret";
    globalThis.fetch = (async (input, init) => {
      expect(String(input)).toBe("https://github.com/login/oauth/access_token");
      expect(init?.method).toBe("POST");
      expect(init?.cache).toBe("no-store");
      expect(JSON.parse(String(init?.body))).toMatchObject({ code: "code", client_secret: "test-secret" });
      return Response.json({ access_token: "ghu_user", refresh_token: "ghr_refresh", expires_in: 28800 });
    }) as typeof fetch;
    const credentials = await exchangeGitHubUserCode("code", "https://chronos.test/api/github/callback");
    expect(credentials.userAccessToken).toBe("ghu_user");
    expect(credentials.userTokenExpiresAt).toBeGreaterThan(Date.now());
  });

  test("a spoofed installation id is rejected even when the App can access it", async () => {
    globalThis.fetch = (async () => Response.json({ installations: [{ id: 123 }] })) as unknown as typeof fetch;
    await expect(assertGitHubUserInstallation("ghu_user", 456)).rejects.toThrow(/not accessible/);
    await expect(assertGitHubUserInstallation("ghu_user", 123)).resolves.toBeUndefined();
  });

  test("installation verification paginates and rejects suspended installations", async () => {
    let pages = 0;
    globalThis.fetch = (async () => {
      pages++;
      return pages === 1
        ? Response.json({ installations: [{ id: 123, suspended_at: "2026-10-17" }] }, { headers: { Link: '<https://api.github.com/user/installations?page=2>; rel="next"' } })
        : Response.json({ installations: [{ id: 456 }] });
    }) as unknown as typeof fetch;
    await expect(assertGitHubUserInstallation("ghu_user", 456)).resolves.toBeUndefined();
    expect(pages).toBe(2);
    pages = 0;
    await expect(assertGitHubUserInstallation("ghu_user", 123)).rejects.toThrow(/not accessible/);
  });

  test("verification reports only requested active installations across all pages", async () => {
    let pages = 0;
    globalThis.fetch = (async () => ++pages === 1
      ? Response.json({ installations: [{ id: 123, suspended_at: "2026-10-17" }, { id: 999 }] },
        { headers: { Link: '<https://api.github.com/user/installations?page=2>; rel="next"' } })
      : Response.json({ installations: [{ id: 456 }] })) as unknown as typeof fetch;
    const verified = await verifiedGitHubUserInstallations("ghu_user", [123, 456, 789]);
    expect([...verified]).toEqual([456]);
    expect(pages).toBe(2);
  });

  test("a malformed response is a provider failure rather than proof of lost access", async () => {
    globalThis.fetch = (async () => Response.json({})) as unknown as typeof fetch;
    await expect(verifiedGitHubUserInstallations("ghu_user", [123])).rejects.toMatchObject({ code: "upstream" });
  });

  test("an incomplete page scan cannot mark unseen accounts as inaccessible", async () => {
    let pages = 0;
    globalThis.fetch = (async () => {
      pages++;
      return Response.json({ installations: [{ id: 123 }] },
        { headers: { Link: '<https://api.github.com/user/installations?page=101>; rel="next"' } });
    }) as unknown as typeof fetch;
    await expect(verifiedGitHubUserInstallations("ghu_user", [123, 456])).rejects.toMatchObject({ code: "upstream" });
    expect(pages).toBe(100);
  });
});
