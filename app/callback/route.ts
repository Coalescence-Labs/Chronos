import { handleAuth } from "@workos-inc/authkit-nextjs";
import type { NextRequest } from "next/server";
import { isAuthConfigured } from "@/lib/auth";

/**
 * WorkOS AuthKit callback — exchanges the auth code and seals the session
 * into an encrypted httpOnly cookie (BFF decision #7).
 *
 * Must match NEXT_PUBLIC_WORKOS_REDIRECT_URI (default: /callback).
 * returnPathname: /account — minimal surface to verify the session.
 *
 * Never log the code, tokens, or user payload here.
 */
const authCallback = handleAuth({
  returnPathname: "/account",
});

export async function GET(request: NextRequest) {
  if (!isAuthConfigured()) {
    return Response.json(
      { error: { code: "auth_not_configured", message: "WorkOS env vars are not set." } },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return authCallback(request);
}
