import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { isAuthConfigured } from "@/lib/auth";

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
  const returnTo = searchParams.get("returnTo") ?? undefined;
  const signInUrl = await getSignInUrl(returnTo ? { returnTo } : undefined);
  return redirect(signInUrl);
}
