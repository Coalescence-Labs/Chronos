import { describe, expect, test } from "bun:test";

describe("github oauth routes", () => {
  test("disconnect is POST-only (GET returns 405)", async () => {
    const source = await Bun.file("app/api/github/disconnect/route.ts").text();
    expect(source).toMatch(/export async function POST/);
    expect(source).toMatch(/export async function GET/);
    expect(source).toMatch(/status:\s*405/);
    expect(source).toMatch(/Allow:\s*"POST"/);
  });

  test("callback never logs and never returns access_token in redirects", async () => {
    const source = await Bun.file("app/api/github/callback/route.ts").text();
    expect(source).not.toMatch(/console\./);
    expect(source).toContain("saveGitHubOAuthSession");
    expect(source).toContain('searchParams.set("github", "connected")');
    expect(source).not.toMatch(/access_token|accessToken.*=.*searchParams/);
  });

  test("connect requires WorkOS user and sets CSRF state cookie", async () => {
    const source = await Bun.file("app/api/github/connect/route.ts").text();
    expect(source).toContain("withAuth");
    expect(source).toContain("GITHUB_COOKIE_POSTURE.stateCookieName");
    expect(source).toContain("buildGitHubAuthorizeUrl");
  });

  test("status route asserts no secrets in public payload", async () => {
    const source = await Bun.file("app/api/github/status/route.ts").text();
    expect(source).toContain("assertNoSecretsInPublicGitHubConnection");
    expect(source).toContain("toPublicGitHubConnection");
  });
});
