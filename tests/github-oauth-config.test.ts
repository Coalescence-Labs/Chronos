import { describe, expect, test } from "bun:test";
import {
  GITHUB_OAUTH_SCOPES,
  buildGitHubAuthorizeUrl,
  githubOAuthCallbackUrl,
  isGitHubOAuthConfigured,
  toPublicGitHubConnection,
  assertNoSecretsInPublicGitHubConnection,
} from "@/lib/github-oauth";

describe("github oauth config", () => {
  test("scopes are read-oriented classic grants including repo for private access", () => {
    expect(GITHUB_OAUTH_SCOPES).toEqual(["read:user", "repo"]);
  });

  test("isGitHubOAuthConfigured requires client id, secret, and ≥32-char password", () => {
    const previous = {
      GITHUB_OAUTH_CLIENT_ID: process.env.GITHUB_OAUTH_CLIENT_ID,
      GITHUB_OAUTH_CLIENT_SECRET: process.env.GITHUB_OAUTH_CLIENT_SECRET,
      GITHUB_SESSION_PASSWORD: process.env.GITHUB_SESSION_PASSWORD,
    };
    delete process.env.GITHUB_OAUTH_CLIENT_ID;
    delete process.env.GITHUB_OAUTH_CLIENT_SECRET;
    delete process.env.GITHUB_SESSION_PASSWORD;
    try {
      expect(isGitHubOAuthConfigured()).toBe(false);
      process.env.GITHUB_OAUTH_CLIENT_ID = "id";
      process.env.GITHUB_OAUTH_CLIENT_SECRET = "secret";
      process.env.GITHUB_SESSION_PASSWORD = "short";
      expect(isGitHubOAuthConfigured()).toBe(false);
      process.env.GITHUB_SESSION_PASSWORD = "x".repeat(32);
      expect(isGitHubOAuthConfigured()).toBe(true);
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  test("callback URL defaults to /api/github/callback on the request origin", () => {
    const previous = process.env.GITHUB_OAUTH_CALLBACK_URL;
    delete process.env.GITHUB_OAUTH_CALLBACK_URL;
    try {
      expect(githubOAuthCallbackUrl("http://localhost:3005")).toBe(
        "http://localhost:3005/api/github/callback",
      );
    } finally {
      if (previous === undefined) delete process.env.GITHUB_OAUTH_CALLBACK_URL;
      else process.env.GITHUB_OAUTH_CALLBACK_URL = previous;
    }
  });

  test("authorize URL includes client_id, scopes, state, redirect_uri", () => {
    const previous = process.env.GITHUB_OAUTH_CLIENT_ID;
    process.env.GITHUB_OAUTH_CLIENT_ID = "test-client";
    try {
      const url = new URL(
        buildGitHubAuthorizeUrl({
          state: "abc",
          redirectUri: "http://localhost:3005/api/github/callback",
        }),
      );
      expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
      expect(url.searchParams.get("client_id")).toBe("test-client");
      expect(url.searchParams.get("scope")).toBe("read:user repo");
      expect(url.searchParams.get("state")).toBe("abc");
      expect(url.searchParams.get("redirect_uri")).toContain("/api/github/callback");
    } finally {
      if (previous === undefined) delete process.env.GITHUB_OAUTH_CLIENT_ID;
      else process.env.GITHUB_OAUTH_CLIENT_ID = previous;
    }
  });

  test("public connection payload never includes token fields", () => {
    const connected = toPublicGitHubConnection({
      accessToken: "gho_SECRET_SHOULD_NOT_LEAK",
      tokenType: "bearer",
      scope: "repo",
      login: "ada",
      workosUserId: "user_1",
      connectedAt: "2026-10-01T00:00:00.000Z",
    });
    expect(connected).toEqual({
      connected: true,
      login: "ada",
      scope: "repo",
      configured: true,
    });
    assertNoSecretsInPublicGitHubConnection(connected);
    expect(JSON.stringify(connected)).not.toMatch(/gho_|accessToken|SECRET/i);
  });
});
