import { describe, expect, test } from "bun:test";

describe("github app routes", () => {
  test("disconnect is POST-only (GET returns 405)", async () => {
    const source = await Bun.file("app/api/github/disconnect/route.ts").text();
    expect(source).toMatch(/export async function POST/);
    expect(source).toMatch(/export async function GET/);
    expect(source).toMatch(/status:\s*405/);
    expect(source).toMatch(/Allow:\s*"POST"/);
  });

  test("callback seals installation id and never returns tokens", async () => {
    const source = await Bun.file("app/api/github/callback/route.ts").text();
    expect(source).not.toMatch(/console\./);
    expect(source).toContain("saveGitHubAppSession");
    expect(source).toContain("writeGitHubInstallMetadata");
    expect(source).toContain("installation_id");
    expect(source).toContain('searchParams.set("github", "connected")');
    expect(source).not.toMatch(/access_token|exchangeGitHubCode/);
  });

  test("connect requires WorkOS user and redirects to App install URL", async () => {
    const source = await Bun.file("app/api/github/connect/route.ts").text();
    expect(source).toContain("withAuth");
    expect(source).toContain("GITHUB_COOKIE_POSTURE.stateCookieName");
    expect(source).toContain("buildGitHubAppInstallUrl");
    expect(source).not.toContain("buildGitHubAuthorizeUrl");
  });

  test("status route asserts no secrets in public payload", async () => {
    const source = await Bun.file("app/api/github/status/route.ts").text();
    expect(source).toContain("assertNoSecretsInPublicGitHubConnection");
    expect(source).toContain("toPublicGitHubConnection");
    expect(source).toContain("resolveGitHubAppSessionForUser");
    expect(source).toContain("persistSession: true");
  });
});
