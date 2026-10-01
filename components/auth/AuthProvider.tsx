import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";
import type { ReactNode } from "react";

/**
 * Client boundary for AuthKit. Required for useAuth() and client refresh.
 * Session secrets stay in the httpOnly cookie — this provider only exposes
 * the public user object AuthKit already derives server-side.
 *
 * When the public redirect URI is unset, skip AuthKit entirely so anonymous
 * browsing never depends on WorkOS client bootstrap.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  if (!process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI) {
    return children;
  }
  return <AuthKitProvider>{children}</AuthKitProvider>;
}
