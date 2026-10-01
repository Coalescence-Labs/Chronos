import { NextResponse } from "next/server";
import { signOut } from "@workos-inc/authkit-nextjs";
import { isAuthConfigured } from "@/lib/auth";

/**
 * POST /api/auth/sign-out — clears the sealed session cookie server-side.
 * GET is intentionally unsupported (prefetch / CSRF risk).
 */
export async function POST(): Promise<Response> {
  if (!isAuthConfigured()) {
    return Response.json(
      { error: { code: "auth_not_configured", message: "WorkOS env vars are not set." } },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  // signOut redirects to WorkOS logout then returnTo; for API callers that
  // prefer JSON, we still invoke it so the cookie is cleared via Set-Cookie.
  await signOut({ returnTo: "/" });
  // Unreachable if signOut always redirects; keep a fallback for typing.
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(): Promise<Response> {
  return Response.json(
    {
      error: {
        code: "method_not_allowed",
        message: "Sign-out requires POST (or the signOut server action).",
      },
    },
    { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } },
  );
}
