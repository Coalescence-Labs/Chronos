/**
 * Bun test preload — AuthKit's client entry transitively imports `server-only`,
 * which throws outside Next.js Server Components. Mock before any AppShell render.
 */
import { mock } from "bun:test";

mock.module("server-only", () => ({}));

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
