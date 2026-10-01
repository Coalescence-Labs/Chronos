import { describe, expect, test } from "bun:test";
import { SITE_URL } from "@/lib/site";
import { sameOriginReturnUrlForHost } from "@/lib/auth/sign-out";

describe("chronos local sign-out", () => {
  test("sign-out module clears wos-session and never calls WorkOS logout URL", async () => {
    const source = await Bun.file("lib/auth/sign-out.ts").text();
    expect(source).toContain("wos-session");
    expect(source).toContain("wos-auth-verifier");
    expect(source).toContain("jar.delete");
    expect(source).toContain("sameOriginReturnUrl");
    expect(source).toContain("originFromRequestHost");
    expect(source).toContain("x-forwarded-host");
    expect(source).not.toContain("getLogoutUrl");
    expect(source).not.toContain("userManagement");
    expect(source).not.toMatch(/from\s+"@workos-inc\/authkit-nextjs"/);
    expect(source).not.toMatch(/from\s+"@\/lib\/site"/);
    expect(source).not.toMatch(/import\s*\{[^}]*SITE_URL/);
    expect(source).not.toMatch(/process\.env\.NEXT_PUBLIC_SITE_URL/);
    expect(source).not.toMatch(/absoluteAuthReturnUrl|authAppOrigin/);
  });

  test("Host localhost:3005 wins over production SITE_URL for return URL", () => {
    expect(SITE_URL).toContain("coalescencelabs.app");

    const url = sameOriginReturnUrlForHost("localhost:3005", "/");
    expect(url).toBe("http://localhost:3005/");
    expect(url).not.toContain("coalescencelabs.app");
    expect(url).not.toContain("vercel.app");
    expect(url.startsWith(SITE_URL)).toBe(false);

    const withProto = sameOriginReturnUrlForHost("localhost:3005", "/demo", "http");
    expect(withProto).toBe("http://localhost:3005/demo");
  });

  test("AccountControls hard-navigates to window.location.origin after sign-out", async () => {
    const source = await Bun.file("components/auth/AccountControls.tsx").text();
    expect(source).toContain("signOutAction");
    expect(source).toContain("window.location.origin");
    expect(source).toContain("window.location.assign");
    expect(source).not.toMatch(/void signOut\b/);
    expect(source).not.toMatch(/signOut\(\s*\{/);
    expect(source).not.toMatch(/useAuth\(\)[\s\S]{0,80}signOut/);
  });

  test("privacy scan: sign-out paths avoid logging", async () => {
    for (const path of ["lib/auth/sign-out.ts", "lib/auth/actions.ts", "app/api/auth/sign-out/route.ts"]) {
      const source = await Bun.file(path).text();
      expect(source).not.toMatch(/console\.(log|info|debug|warn|error)/);
    }
  });
});
