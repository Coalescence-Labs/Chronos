import { describe, expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import {
  GITHUB_APP_PERMISSIONS,
  githubAppSetupUrl,
  isGitHubAppConfigured,
} from "@/lib/github-app/config";
import { buildGitHubAppInstallUrl } from "@/lib/github-app/install";
import { createGitHubAppJwt } from "@/lib/github-app/jwt";
import {
  assertNoSecretsInPublicGitHubConnection,
  toPublicGitHubConnection,
} from "@/lib/github-app/session";

function testPrivateKeyPem(): string {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  return privateKey;
}

describe("github app config", () => {
  test("permissions are Contents + Metadata read-only", () => {
    expect(GITHUB_APP_PERMISSIONS).toEqual(["contents:read", "metadata:read"]);
  });

  test("isGitHubAppConfigured requires app id, slug, private key, and ≥32-char password", () => {
    const previous = {
      GITHUB_APP_ID: process.env.GITHUB_APP_ID,
      GITHUB_APP_SLUG: process.env.GITHUB_APP_SLUG,
      GITHUB_APP_PRIVATE_KEY: process.env.GITHUB_APP_PRIVATE_KEY,
      GITHUB_SESSION_PASSWORD: process.env.GITHUB_SESSION_PASSWORD,
    };
    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_APP_SLUG;
    delete process.env.GITHUB_APP_PRIVATE_KEY;
    delete process.env.GITHUB_SESSION_PASSWORD;
    try {
      expect(isGitHubAppConfigured()).toBe(false);
      process.env.GITHUB_APP_ID = "12345";
      process.env.GITHUB_APP_SLUG = "chronos";
      process.env.GITHUB_APP_PRIVATE_KEY = testPrivateKeyPem();
      process.env.GITHUB_SESSION_PASSWORD = "short";
      expect(isGitHubAppConfigured()).toBe(false);
      process.env.GITHUB_SESSION_PASSWORD = "x".repeat(32);
      expect(isGitHubAppConfigured()).toBe(true);
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  test("setup URL defaults to /api/github/callback on the request origin", () => {
    const previous = process.env.GITHUB_APP_SETUP_URL;
    delete process.env.GITHUB_APP_SETUP_URL;
    try {
      expect(githubAppSetupUrl("http://localhost:3005")).toBe(
        "http://localhost:3005/api/github/callback",
      );
    } finally {
      if (previous === undefined) delete process.env.GITHUB_APP_SETUP_URL;
      else process.env.GITHUB_APP_SETUP_URL = previous;
    }
  });

  test("install URL points at apps/{slug}/installations/new with state", () => {
    const previous = process.env.GITHUB_APP_SLUG;
    process.env.GITHUB_APP_SLUG = "chronos-dev";
    try {
      const url = new URL(buildGitHubAppInstallUrl({ state: "abc" }));
      expect(url.origin + url.pathname).toBe(
        "https://github.com/apps/chronos-dev/installations/new",
      );
      expect(url.searchParams.get("state")).toBe("abc");
    } finally {
      if (previous === undefined) delete process.env.GITHUB_APP_SLUG;
      else process.env.GITHUB_APP_SLUG = previous;
    }
  });

  test("App JWT is RS256 with iss = app id", () => {
    const pem = testPrivateKeyPem();
    const jwt = createGitHubAppJwt("424242", pem);
    const parts = jwt.split(".");
    expect(parts).toHaveLength(3);
    const [headerB64, payloadB64, sig] = parts as [string, string, string];
    expect(sig.length).toBeGreaterThan(20);
    const header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8"));
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    expect(header).toEqual({ alg: "RS256", typ: "JWT" });
    expect(payload.iss).toBe("424242");
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });

  test("public connection payload never includes token or installation id", () => {
    const connected = toPublicGitHubConnection({
      installationId: 99,
      accountLogin: "ada",
      accountType: "User",
      workosUserId: "user_1",
      connectedAt: "2026-10-01T00:00:00.000Z",
      permissions: "contents:read,metadata:read",
    });
    expect(connected).toEqual({
      connected: true,
      login: "ada",
      permissions: "contents:read,metadata:read",
      configured: true,
    });
    assertNoSecretsInPublicGitHubConnection(connected);
    expect(JSON.stringify(connected)).not.toMatch(
      /ghs_|accessToken|installationId|PRIVATE KEY|SECRET/i,
    );
  });
});
