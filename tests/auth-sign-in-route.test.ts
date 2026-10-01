/**
 * Mocked AuthKit sign-in / callback wiring — no real WorkOS network or secrets.
 * Isolated file so mock.module does not leak into other auth suites.
 */
import { afterAll, describe, expect, mock, test } from "bun:test";

const ENV_KEYS = [
  "WORKOS_CLIENT_ID",
  "WORKOS_API_KEY",
  "WORKOS_COOKIE_PASSWORD",
  "NEXT_PUBLIC_WORKOS_REDIRECT_URI",
] as const;

const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};
const captured: {
  getSignInUrlOpts?: { returnTo?: string };
  getSignUpUrlOpts?: { returnTo?: string };
  handleAuthOpts?: { returnPathname?: string };
} = {};

for (const key of ENV_KEYS) {
  saved[key] = process.env[key];
}

process.env.WORKOS_CLIENT_ID = "client_test";
process.env.WORKOS_API_KEY = "sk_test";
process.env.WORKOS_COOKIE_PASSWORD = "x".repeat(32);
process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI = "http://localhost:3005/callback";

mock.module("@workos-inc/authkit-nextjs", () => ({
  getSignInUrl: async (opts?: { returnTo?: string }) => {
    captured.getSignInUrlOpts = opts;
    return "https://authkit.test/authorize?mock=1";
  },
  getSignUpUrl: async (opts?: { returnTo?: string }) => {
    captured.getSignUpUrlOpts = opts;
    return "https://authkit.test/sign-up?mock=1";
  },
  handleAuth: (opts?: { returnPathname?: string }) => {
    captured.handleAuthOpts = opts;
    return async () => new Response(null, { status: 204 });
  },
  signOut: async () => {},
  withAuth: async () => ({ user: null }),
}));

mock.module("next/navigation", () => ({
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    prefetch: () => {},
    back: () => {},
    forward: () => {},
    refresh: () => {},
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  redirect: (url: string) => {
    const error = new Error(`REDIRECT:${url}`);
    (error as { digest?: string }).digest = `NEXT_REDIRECT;replace;${url};303`;
    throw error;
  },
}));

const { GET: signInGet } = await import("@/app/sign-in/route");
const { GET: signUpGet } = await import("@/app/sign-up/route");
const { GET: apiSignInGet } = await import("@/app/api/auth/sign-in/route");
// Importing callback captures handleAuth({ returnPathname }) at module init.
await import("@/app/callback/route");

afterAll(() => {
  for (const key of ENV_KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function expectRedirect(run: () => Promise<Response>, toUrl: string) {
  try {
    await run();
    expect.unreachable("expected redirect() to throw");
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(`REDIRECT:${toUrl}`);
  }
}

describe("mocked sign-in returnTo pass-through", () => {
  test("callback handleAuth fallback is `/`, not `/account`", () => {
    expect(captured.handleAuthOpts).toEqual({ returnPathname: "/" });
    expect(captured.handleAuthOpts?.returnPathname).not.toBe("/account");
  });

  test("sign-in passes sanitized returnTo to getSignInUrl", async () => {
    await expectRedirect(
      () => signInGet(new Request("http://localhost:3005/sign-in?returnTo=%2Fdemo")),
      "https://authkit.test/authorize?mock=1",
    );
    expect(captured.getSignInUrlOpts).toEqual({ returnTo: "/demo" });
  });

  test("sign-in rewrites unsafe returnTo to `/` before getSignInUrl", async () => {
    await expectRedirect(
      () =>
        signInGet(
          new Request("http://localhost:3005/sign-in?returnTo=https%3A%2F%2Fevil.example%2Fx"),
        ),
      "https://authkit.test/authorize?mock=1",
    );
    expect(captured.getSignInUrlOpts).toEqual({ returnTo: "/" });
  });

  test("sign-in without returnTo still calls getSignInUrl with `/`", async () => {
    await expectRedirect(
      () => signInGet(new Request("http://localhost:3005/sign-in")),
      "https://authkit.test/authorize?mock=1",
    );
    expect(captured.getSignInUrlOpts).toEqual({ returnTo: "/" });
  });

  test("api sign-in alias sanitizes returnTo the same way", async () => {
    await expectRedirect(
      () =>
        apiSignInGet(
          new Request("http://localhost:3005/api/auth/sign-in?returnTo=%2Frepo%2Fa%2Fb"),
        ),
      "https://authkit.test/authorize?mock=1",
    );
    expect(captured.getSignInUrlOpts).toEqual({ returnTo: "/repo/a/b" });
  });

  test("sign-up passes sanitized returnTo to getSignUpUrl", async () => {
    await expectRedirect(
      () => signUpGet(new Request("http://localhost:3005/sign-up?returnTo=%2Faccount")),
      "https://authkit.test/sign-up?mock=1",
    );
    expect(captured.getSignUpUrlOpts).toEqual({ returnTo: "/account" });
  });
});
