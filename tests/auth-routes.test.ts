import { describe, expect, test } from "bun:test";
import { isAuthConfigured, toPublicSession } from "@/lib/auth";

describe("auth route handlers", () => {
  test("unconfigured WorkOS yields anonymous /me-shaped payload", () => {
    const previous = {
      WORKOS_CLIENT_ID: process.env.WORKOS_CLIENT_ID,
      WORKOS_API_KEY: process.env.WORKOS_API_KEY,
      WORKOS_COOKIE_PASSWORD: process.env.WORKOS_COOKIE_PASSWORD,
      NEXT_PUBLIC_WORKOS_REDIRECT_URI: process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI,
    };
    delete process.env.WORKOS_CLIENT_ID;
    delete process.env.WORKOS_API_KEY;
    delete process.env.WORKOS_COOKIE_PASSWORD;
    delete process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI;

    try {
      expect(isAuthConfigured()).toBe(false);
      const body = { ...toPublicSession(null), configured: false };
      expect(body).toEqual({ authenticated: false, user: null, configured: false });
      expect(JSON.stringify(body)).not.toMatch(/accessToken|refreshToken|sk_/i);
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  test("sign-out route exports POST and a 405 GET (no signOut on GET)", async () => {
    const source = await Bun.file("app/api/auth/sign-out/route.ts").text();
    expect(source).toMatch(/export async function POST/);
    expect(source).toMatch(/export async function GET/);
    expect(source).toMatch(/status:\s*405/);
    expect(source).toMatch(/Allow:\s*"POST"/);
    // GET must not invoke signOut (prefetch / CSRF).
    const getBlock = source.slice(source.indexOf("export async function GET"));
    expect(getBlock).not.toMatch(/signOut\s*\(/);
  });

  test("callback route uses handleAuth only", async () => {
    const source = await Bun.file("app/callback/route.ts").text();
    expect(source).toContain("handleAuth");
    expect(source).toContain("export const GET");
    expect(source).not.toMatch(/console\./);
  });

  test("sign-in routes use getSignInUrl (PKCE-safe)", async () => {
    for (const path of ["app/sign-in/route.ts", "app/api/auth/sign-in/route.ts"]) {
      const source = await Bun.file(path).text();
      expect(source).toContain("getSignInUrl");
      expect(source).not.toContain("getAuthorizationUrl");
    }
  });
});
