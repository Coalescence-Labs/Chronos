import { authkitProxy } from "@workos-inc/authkit-nextjs";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { isAuthConfigured, workosRedirectUri } from "./config";

/**
 * Next.js 16 proxy handler for optional WorkOS AuthKit.
 *
 * AuthKit's `authkitProxy` throws if `NEXT_PUBLIC_WORKOS_REDIRECT_URI` is
 * missing — even with `eagerAuth: false` and `middlewareAuth.enabled: false`.
 * Chronos auth is optional, so we no-op when WorkOS env is not configured.
 */
export function createAuthProxyHandler() {
  let authkit: ReturnType<typeof authkitProxy> | null = null;

  return function chronosAuthProxy(request: NextRequest, event: NextFetchEvent) {
    if (!isAuthConfigured()) {
      return NextResponse.next();
    }

    if (!authkit) {
      authkit = authkitProxy({
        // Never enable eagerAuth: it mirrors a JWT into a client-readable cookie.
        eagerAuth: false,
        // AuthKit reads NEXT_PUBLIC_WORKOS_REDIRECT_URI; pass explicitly so the
        // closed-over value is set when env becomes available at first auth hit.
        redirectUri: workosRedirectUri(),
        middlewareAuth: {
          enabled: false,
          unauthenticatedPaths: [],
        },
      });
    }

    return authkit(request, event);
  };
}
