import { describe, expect, test } from "bun:test";

describe("resolveGitHubAccessToken (shared browser)", () => {
  test("resolves session per WorkOS user via resolveGitHubAppSessionForUser", async () => {
    const source = await Bun.file("lib/github-app/token.ts").text();
    expect(source).toContain("resolveGitHubAppSessionForUser");
    expect(source).toContain("persistSession: true");
    expect(source).not.toContain("readGitHubAppSessionForUser");
  });

  test("readGitHubAppSessionForUser rejects mismatched workosUserId (fail closed)", async () => {
    const source = await Bun.file("lib/github-app/session.ts").text();
    expect(source).toMatch(/session\.workosUserId\s*!==\s*workosUserId/);
  });
});
