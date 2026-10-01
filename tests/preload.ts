/**
 * Bun test preload — AuthKit's client entry transitively imports `server-only`,
 * which throws outside Next.js Server Components. Mock before any AppShell render.
 *
 * Also stubs App Router navigation so suites that mock only `redirect` cannot
 * wipe `useRouter` / `usePathname` for later files (smoke / AccountControls).
 */
import { mock } from "bun:test";

mock.module("server-only", () => ({}));

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
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

mock.module("@workos-inc/authkit-nextjs/components", () => ({
  AuthKitProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    user: null,
    loading: false,
    signOut: async () => {},
    refreshAuth: async () => {},
    getAuth: async () => {},
    sessionId: undefined,
    organizationId: undefined,
    role: undefined,
    roles: undefined,
    permissions: undefined,
    entitlements: undefined,
    featureFlags: undefined,
    impersonator: undefined,
    switchToOrganization: async () => ({ error: "mock" }),
  }),
}));
