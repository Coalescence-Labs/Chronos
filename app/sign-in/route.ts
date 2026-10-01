import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { isAuthConfigured } from "@/lib/auth";

/**
 * WorkOS dashboard "Sign-in endpoint" / initiate_login_uri.
 * Sets PKCE cookies then redirects to AuthKit hosted UI.
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
