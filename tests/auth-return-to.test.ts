import { describe, expect, test } from "bun:test";
import {
  absoluteAuthReturnUrl,
  authAppOrigin,
  sanitizeReturnPath,
  signInHrefForReturn,
} from "@/lib/auth/return-to";

describe("auth returnTo helpers", () => {
  test("sanitizeReturnPath allows same-origin paths and rejects open redirects", () => {
    expect(sanitizeReturnPath(null)).toBe("/");
    expect(sanitizeReturnPath("/demo")).toBe("/demo");
    expect(sanitizeReturnPath("/repo/acme/app?tab=1")).toBe("/repo/acme/app?tab=1");
    expect(sanitizeReturnPath("https://evil.example/phish")).toBe("/");
    expect(sanitizeReturnPath("//evil.example")).toBe("/");
    expect(sanitizeReturnPath("/sign-in")).toBe("/");
    expect(sanitizeReturnPath("/callback")).toBe("/");
    expect(sanitizeReturnPath("/api/auth/me")).toBe("/");
  });

  test("signInHrefForReturn encodes returnTo except for home", () => {
    expect(signInHrefForReturn("/")).toBe("/sign-in");
    expect(signInHrefForReturn("/demo")).toBe("/sign-in?returnTo=%2Fdemo");
  });

  test("absoluteAuthReturnUrl builds WorkOS-safe logout URLs", () => {
    const previous = process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI;
    process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI = "http://localhost:3005/callback";
    try {
      expect(authAppOrigin()).toBe("http://localhost:3005");
      expect(absoluteAuthReturnUrl("/")).toBe("http://localhost:3005/");
      expect(absoluteAuthReturnUrl("/demo")).toBe("http://localhost:3005/demo");
      expect(absoluteAuthReturnUrl("/")).not.toBe("/");
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI;
      else process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI = previous;
    }
  });

  test("callback defaults to home, not /account", async () => {
    const source = await Bun.file("app/callback/route.ts").text();
    expect(source).toContain('returnPathname: "/"');
    expect(source).not.toContain('returnPathname: "/account"');
  });

  test("sign-out uses Chronos local clear, not AuthKit hosted logout", async () => {
    const action = await Bun.file("lib/auth/actions.ts").text();
    expect(action).toContain("chronosSignOut");
    expect(action).not.toMatch(/from\s+"@workos-inc\/authkit-nextjs"/);

    const local = await Bun.file("lib/auth/sign-out.ts").text();
    expect(local).toContain("cookies()");
    expect(local).toContain("redirect(");
    expect(local).not.toContain("getLogoutUrl");
    expect(local).not.toMatch(/from\s+"@workos-inc\/authkit-nextjs"/);

    const route = await Bun.file("app/api/auth/sign-out/route.ts").text();
    expect(route).toContain("chronosSignOut");
    expect(route).not.toMatch(/from\s+"@workos-inc\/authkit-nextjs"/);
  });

  test("AccountControls preserves returnTo and uses local signOutAction", async () => {
    const source = await Bun.file("components/auth/AccountControls.tsx").text();
    expect(source).toContain("signInHrefForReturn");
    expect(source).toContain("signOutAction");
    expect(source).not.toMatch(/signOut\(\s*\{/);
    expect(source).not.toMatch(/void signOut\b/);
  });
});
