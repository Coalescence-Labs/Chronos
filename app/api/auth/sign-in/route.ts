import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { isAuthConfigured } from "@/lib/auth";
import { sanitizeReturnPath } from "@/lib/auth/return-to";

/**
 * API alias for sign-in (same as /sign-in). Prefer /sign-in as the WorkOS
 * dashboard Sign-in endpoint; this path exists for a stable /api/auth/* surface.
 */
export async function GET(request: Request): Promise<Response> {
  if (!isAuthConfigured()) {
    return Response.json(
      { error: { code: "auth_not_configured", message: "WorkOS env vars are not set." } },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { searchParams } = new URL(request.url);
  const returnTo = sanitizeReturnPath(searchParams.get("returnTo"));
  const signInUrl = await getSignInUrl({ returnTo });
  return redirect(signInUrl);
}
