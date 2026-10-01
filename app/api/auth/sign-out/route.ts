import { NextResponse } from "next/server";
import { isAuthConfigured } from "@/lib/auth";
import { chronosSignOut } from "@/lib/auth/sign-out";

/**
 * POST /api/auth/sign-out — clears the sealed session cookie server-side.
 * GET is intentionally unsupported (prefetch / CSRF risk).
 *
 * Local clear + redirect (no WorkOS hosted logout / error.workos.com).
 */
export async function POST(): Promise<Response> {
  if (!isAuthConfigured()) {
    return Response.json(
      { error: { code: "auth_not_configured", message: "WorkOS env vars are not set." } },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  // chronosSignOut always redirect()s — this line is for typing / unconfigured paths only.
  await chronosSignOut("/");
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
