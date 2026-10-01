import { describe, expect, test } from "bun:test";

describe("chronos local sign-out", () => {
  test("sign-out module clears wos-session and never calls WorkOS logout URL", async () => {
    const source = await Bun.file("lib/auth/sign-out.ts").text();
    expect(source).toContain("wos-session");
    expect(source).toContain("wos-auth-verifier");
    expect(source).toContain("jar.delete");
    expect(source).toContain("redirect(sanitizeReturnPath(returnPath))");
    expect(source).not.toContain("getLogoutUrl");
    expect(source).not.toContain("userManagement");
    expect(source).not.toMatch(/from\s+"@workos-inc\/authkit-nextjs"/);
  });

  test("privacy scan: sign-out paths avoid logging", async () => {
    for (const path of ["lib/auth/sign-out.ts", "lib/auth/actions.ts", "app/api/auth/sign-out/route.ts"]) {
      const source = await Bun.file(path).text();
      expect(source).not.toMatch(/console\.(log|info|debug|warn|error)/);
    }
  });
});
