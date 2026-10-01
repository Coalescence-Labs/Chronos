import { describe, expect, test } from "bun:test";
import { Glob } from "bun";

/**
 * Auth surface must not log secrets or put tokens in localStorage.
 * Complements docs/PRIVACY.md "User accounts" pre-flight.
 */
describe("auth privacy posture", () => {
  test("auth modules avoid console logging and localStorage", async () => {
    const roots = ["lib/auth", "app/api/auth", "app/callback", "app/sign-in", "app/sign-up", "app/account", "components/auth"];
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

  test("no GET sign-out route handler exists", async () => {
    const candidates = [
      "app/api/auth/sign-out/route.ts",
      "app/auth/sign-out/route.ts",
      "app/sign-out/route.ts",
    ];
    for (const path of candidates) {
      const file = Bun.file(path);
      if (!(await file.exists())) continue;
      const source = await file.text();
      // POST may exist; a dedicated GET that calls signOut is forbidden.
      // We allow GET that only returns 405.
      const dangerous =
        /export\s+(async\s+)?function\s+GET[\s\S]*signOut\s*\(/.test(source) ||
        /export\s+const\s+GET[\s\S]*signOut\s*\(/.test(source);
      expect(dangerous).toBe(false);
    }
  });

  test(".env.example documents WorkOS vars without secrets", async () => {
    const example = await Bun.file(".env.example").text();
    expect(example).toContain("WORKOS_CLIENT_ID");
    expect(example).toContain("WORKOS_API_KEY");
    expect(example).toContain("WORKOS_COOKIE_PASSWORD");
    expect(example).toContain("NEXT_PUBLIC_WORKOS_REDIRECT_URI");
    expect(example).toContain("WORKOS_COOKIE_MAX_AGE=604800");
    expect(example).not.toMatch(/sk_live_|sk_test_[A-Za-z0-9]{20,}/);
  });
});
