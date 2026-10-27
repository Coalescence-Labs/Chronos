import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as config from "@/lib/github-app/config";
import * as sessionModule from "@/lib/github-app/session";
import type { GitHubAppSessionData } from "@/lib/github-app/types";
import { githubInstallMetadataFromSession, writeGitHubInstallMetadata } from "@/lib/github-app/workos-metadata";
import { SMALL_REPO } from "./fixtures/github";

let sequence = 0;
let session: GitHubAppSessionData | undefined;
let metadata: Record<string, string> = {};
let unavailable = false;
let mintCalls = 0;
let dataCalls = 0;
let githubCalls = 0;
let grantRevocations = 0;
let accessibleInstallations: { id: number; suspended_at?: string }[] = [];
const originalFetch = globalThis.fetch;
mock.module("@/lib/auth/config", () => ({ isAuthConfigured: () => true }));
mock.module("@/lib/github-app/config", () => ({ ...config, isGitHubAppConfigured: () => true, githubAppId: () => "audit_app", githubAppPoolToken: () => undefined,
  githubAppClientId: () => "fake_client", githubAppClientSecret: () => "fake_secret" }));
mock.module("@/lib/github-app/jwt", () => ({ createGitHubAppJwt: () => "signed_fake_jwt" }));
mock.module("@/lib/github-app/session", () => ({
  ...sessionModule,
  readGitHubAppSessionForUser: async (id: string) => id === session?.workosUserId ? { ...session } : undefined,
  saveGitHubAppSession: async (data: GitHubAppSessionData) => { session = data; },
  destroyGitHubAppSession: async () => { session = undefined; },
}));
mock.module("@/lib/github-app/metadata-client", () => ({ githubMetadataClient: () => ({ userManagement: {
  getUser: async () => { if (unavailable) throw new Error("Provider unavailable"); return { metadata: { ...metadata } }; },
  updateUser: async ({ metadata: patch }: { metadata: Record<string, string | null> }) => {
    for (const [key, value] of Object.entries(patch)) if (value === null) delete metadata[key]; else metadata[key] = value;
    return { metadata: { ...metadata } };
  },
} }) }));
mock.module("@workos-inc/authkit-nextjs", () => ({ withAuth: async () => ({ user: { id: "user_security" } }) }));
beforeEach(() => {
  sequence++; mintCalls = 0; dataCalls = 0; githubCalls = 0; grantRevocations = 0; unavailable = false;
  session = { installationId: 88000 + sequence, accountLogin: "acme", accountType: "Organization", workosUserId: "user_security",
    connectedAt: "2026-10-17T00:00:00Z", permissions: "contents:read,metadata:read", userAccessToken: "ghu_fake", authorizationVersion: "initial" };
  metadata = githubInstallMetadataFromSession(session);
  accessibleInstallations = [{ id: session.installationId }];
  globalThis.fetch = (async (input, init) => {
    githubCalls++;
    const url = new URL(String(input));
    if (url.pathname.endsWith("/access_tokens")) {
      mintCalls++;
      expect(JSON.parse(String(init?.body))).toEqual({ repositories: ["private"], permissions: { contents: "read", metadata: "read" } });
      return Response.json({ token: "ghs_fake", expires_at: new Date(Date.now() + 3600_000).toISOString() });
    }
    if (url.pathname.endsWith("/grant")) { grantRevocations++; return new Response(null, { status: 204 }); }
    if (url.pathname === "/user/installations") return Response.json({ installations: accessibleInstallations });
    if (url.pathname === "/repos/acme/private") return Response.json({ default_branch: "main", private: true });
    if (url.pathname.endsWith("/commits")) { dataCalls++; return Response.json(SMALL_REPO.commits); }
    if (url.pathname.endsWith("/branches")) return Response.json(SMALL_REPO.branches);
    if (url.pathname.endsWith("/tags")) return Response.json(SMALL_REPO.tags);
    throw new Error("Unexpected network request in security fixture");
  }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = originalFetch; });
const repoRequest = () => new Request("https://chronos.test/api/repo?repo=acme/private");
const disconnectRequest = (origin = "https://chronos.test") => new Request("https://chronos.test/api/github/disconnect", { method: "POST", headers: { origin } });

describe("GitHub authorization boundaries through real BFF handlers", () => {
  test("connected status requires a live installation check and contains no credentials", async () => {
    const { GET } = await import("@/app/api/github/status/route");
    const response = await GET(new Request("https://chronos.test/api/github/status"));
    const body = await response.json();
    expect(body.connected).toBe(true); expect(body.state).toBe("connected");
    expect(JSON.stringify(body)).not.toMatch(/ghu_|ghs_|installationId|authorizationVersion/);
  });
  test("expired credentials require reconnect instead of a false connected status", async () => {
    session = { ...session!, userTokenExpiresAt: 1 };
    const { GET } = await import("@/app/api/github/status/route");
    const response = await GET(new Request("https://chronos.test/api/github/status"));
    expect(await response.json()).toMatchObject({ connected: false, state: "reconnect-required" });
  });
  test("a stale primary installation cannot hide a healthy saved account", async () => {
    const healthy = { ...session!, installationId: session!.installationId + 1000, accountLogin: "healthy" };
    session = { ...session!, additionalInstallations: [healthy] };
    metadata = githubInstallMetadataFromSession(session);
    const before = { ...metadata };
    accessibleInstallations = [{ id: healthy.installationId }];
    const { GET } = await import("@/app/api/github/status/route");
    const response = await GET(new Request("https://chronos.test/api/github/status"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ connected: true, state: "connected", accounts: [
      { login: "acme", connected: false }, { login: "healthy", connected: true },
    ] });
    expect(JSON.stringify(body)).not.toMatch(/ghu_|ghs_|installationId|authorizationVersion/);
    expect(metadata).toEqual(before); expect(mintCalls).toBe(0);
  });
  test("an unavailable saved installation never bypasses the user's repository permission check", async () => {
    const healthy = { ...session!, installationId: session!.installationId + 1000, accountLogin: "healthy" };
    session = { ...session!, additionalInstallations: [healthy] };
    metadata = githubInstallMetadataFromSession(session);
    accessibleInstallations = [{ id: healthy.installationId }];
    const fixtureFetch = globalThis.fetch;
    globalThis.fetch = (async (input, init) => new URL(String(input)).pathname === "/repos/acme/private"
      ? Response.json({}, { status: 404 }) : fixtureFetch(input, init)) as typeof fetch;
    const { GET: status } = await import("@/app/api/github/status/route");
    expect(await (await status(new Request("https://chronos.test/api/github/status"))).json()).toMatchObject({ connected: true });
    const { GET: repo } = await import("@/app/api/repo/route");
    expect((await repo(repoRequest())).status).toBe(404);
    expect(mintCalls).toBe(0); expect(dataCalls).toBe(0);
  });
  test("suspended installations are labeled while healthy installations stay connected", async () => {
    const suspended = { ...session!, installationId: session!.installationId + 1000, accountLogin: "suspended" };
    session = { ...session!, additionalInstallations: [suspended] };
    metadata = githubInstallMetadataFromSession(session);
    accessibleInstallations.push({ id: suspended.installationId, suspended_at: "2026-10-17" });
    const { GET } = await import("@/app/api/github/status/route");
    expect(await (await GET(new Request("https://chronos.test/api/github/status"))).json()).toMatchObject({
      connected: true, accounts: [{ login: "acme", connected: true }, { login: "suspended", connected: false }],
    });
  });
  test("no verified installations requires reconnect without deleting bindings", async () => {
    accessibleInstallations = [];
    const before = { ...metadata };
    const { GET } = await import("@/app/api/github/status/route");
    expect(await (await GET(new Request("https://chronos.test/api/github/status"))).json()).toMatchObject({
      connected: false, state: "reconnect-required",
    });
    expect(metadata).toEqual(before); expect(mintCalls).toBe(0);
  });
  test("provider outages remain distinct from disconnected status", async () => {
    unavailable = true;
    const { GET } = await import("@/app/api/github/status/route");
    const response = await GET(new Request("https://chronos.test/api/github/status"));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ connected: false, state: "unavailable" });
  });
  test("an interrupted legacy disconnect exposes a recovery state and blocks repo access", async () => {
    metadata.chronosGhVersion = "revoking:interrupted";
    const { GET: status } = await import("@/app/api/github/status/route");
    const response = await status(new Request("https://chronos.test/api/github/status"));
    expect(await response.json()).toMatchObject({ connected: false, state: "disconnect-incomplete" });
    const { GET: repo } = await import("@/app/api/repo/route");
    expect((await repo(repoRequest())).status).toBe(409);
    expect(githubCalls).toBe(0);
  });
  test("reuses a scoped installation token but still authorizes every page", async () => {
    const { GET: repo } = await import("@/app/api/repo/route");
    const { GET: page } = await import("@/app/api/repo/commits/route");
    expect((await repo(repoRequest())).status).toBe(200);
    expect(githubCalls).toBe(5);
    expect((await page(new Request("https://chronos.test/api/repo/commits?repo=acme/private&sha=main&page=2"))).status).toBe(200);
    expect(githubCalls).toBe(7);
    expect(mintCalls).toBe(1); expect(dataCalls).toBe(2);
  });
  test("a previously issued cookie cannot read private history after disconnect", async () => {
    const oldCookie = { ...session! };
    const { POST } = await import("@/app/api/github/disconnect/route");
    expect((await POST(disconnectRequest())).status).toBe(200);
    expect(grantRevocations).toBe(1); expect(session).toBeUndefined();
    session = oldCookie;
    const { GET } = await import("@/app/api/repo/route");
    expect((await GET(repoRequest())).status).toBe(404);
    expect(dataCalls).toBe(0); expect(mintCalls).toBe(0);
  });
  test("reconnect does not reactivate cookies from before disconnect", async () => {
    const oldCookie = { ...session! };
    const { POST } = await import("@/app/api/github/disconnect/route");
    await POST(disconnectRequest());
    await writeGitHubInstallMetadata("user_security", { ...oldCookie, authorizationVersion: metadata.chronosGhVersion });
    session = oldCookie;
    const { GET } = await import("@/app/api/repo/route");
    expect((await GET(repoRequest())).status).toBe(401);
    expect(dataCalls).toBe(0); expect(mintCalls).toBe(0);
  });
  test("a metadata outage cannot fall back to another credential for private history", async () => {
    unavailable = true;
    const { GET } = await import("@/app/api/repo/route");
    const response = await GET(repoRequest());
    expect(response.status).toBe(502); expect(dataCalls).toBe(0); expect(mintCalls).toBe(0);
    expect(await response.text()).not.toContain("ghu_fake");
  });
  test("cross-origin disconnect cannot clear credentials or revoke a grant", async () => {
    const { POST } = await import("@/app/api/github/disconnect/route");
    expect((await POST(disconnectRequest("https://sibling.chronos.test"))).status).toBe(403);
    expect(grantRevocations).toBe(0); expect(session?.userAccessToken).toBe("ghu_fake");
  });
});
