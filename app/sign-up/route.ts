import { getSignUpUrl } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { isAuthConfigured } from "@/lib/auth";
import { sanitizeReturnPath } from "@/lib/auth/return-to";

/**
 * Optional sign-up entry — AuthKit hosted UI with sign-up screen hint.
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
  const signUpUrl = await getSignUpUrl({ returnTo });
  return redirect(signUpUrl);
}
