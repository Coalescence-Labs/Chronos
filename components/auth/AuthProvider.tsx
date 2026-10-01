import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";
import type { ReactNode } from "react";

/**
 * Client boundary for AuthKit. Required for useAuth() and client refresh.
 * Session secrets stay in the httpOnly cookie — this provider only exposes
 * the public user object AuthKit already derives server-side.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  return <AuthKitProvider>{children}</AuthKitProvider>;
}
