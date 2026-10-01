import { createAuthProxyHandler } from "@/lib/auth/proxy-handler";

/**
 * Next.js 16 proxy: refreshes the sealed WorkOS session cookie when auth is
 * configured; otherwise a pure pass-through so anonymous public paste/demo
 * work with zero WorkOS env.
 *
 * Matcher excludes Next static assets so CSS/fonts/PWA bits are not intercepted.
 */
export default createAuthProxyHandler();

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
