import { describe, expect, test } from "bun:test";
import { Glob } from "bun";

describe("github oauth privacy posture", () => {
  test("github-oauth + github api routes avoid console and localStorage", async () => {
    const roots = ["lib/github-oauth", "app/api/github"];
    const violations: string[] = [];
    let filesChecked = 0;

    for (const root of roots) {
      const glob = new Glob("**/*.{ts,tsx}");
      for await (const rel of glob.scan(root)) {
        const path = `${root}/${rel}`;
        filesChecked++;
        const source = await Bun.file(path).text();
        if (/console\.|localStorage|sessionStorage/.test(source)) {
          violations.push(path);
        }
      }
    }

    expect(filesChecked).toBeGreaterThan(0);
    expect(violations).toEqual([]);
  });

  test("sign-out clears GitHub OAuth session", async () => {
    const source = await Bun.file("lib/auth/sign-out.ts").text();
    expect(source).toContain("destroyGitHubOAuthSession");
  });

  test(".env.example documents GitHub OAuth vars without secrets", async () => {
    const example = await Bun.file(".env.example").text();
    expect(example).toContain("GITHUB_OAUTH_CLIENT_ID");
    expect(example).toContain("GITHUB_OAUTH_CLIENT_SECRET");
    expect(example).toContain("GITHUB_SESSION_PASSWORD");
    expect(example).toContain("distinct from WorkOS");
    expect(example).not.toMatch(/gho_[A-Za-z0-9]{20,}/);
  });

  test("docs/PRIVACY.md has COA-202 pre-flight", async () => {
    const privacy = await Bun.file("docs/PRIVACY.md").text();
    expect(privacy).toContain("Privacy pre-flight — COA-202");
    expect(privacy).toContain("gh-session");
    expect(privacy).toContain("read:user");
  });
});
