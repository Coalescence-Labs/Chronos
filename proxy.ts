import { authkitProxy } from "@workos-inc/authkit-nextjs";

/**
 * Next.js 16 proxy: refreshes the sealed WorkOS session cookie.
 *
 * Auth is optional — public paste/demo/repo flows stay unauthenticated.
 * middlewareAuth.enabled stays false so Chronos never forces a login wall.
 *
 * Matcher excludes Next static assets so CSS/fonts/PWA bits are not intercepted.
 */
export default authkitProxy({
  // Do not enable eagerAuth: it would surface a JWT outside the sealed session.
  eagerAuth: false,
  middlewareAuth: {
    enabled: false,
    unauthenticatedPaths: [],
  },
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
