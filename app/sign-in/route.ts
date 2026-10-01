import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { isAuthConfigured } from "@/lib/auth";
import { sanitizeReturnPath } from "@/lib/auth/return-to";

/**
 * WorkOS dashboard "Sign-in endpoint" / initiate_login_uri.
 * Sets PKCE cookies then redirects to AuthKit hosted UI.
 * ?returnTo=/path is sealed into AuthKit state and used after /callback.
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
