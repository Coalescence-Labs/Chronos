import { getSignUpUrl } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { isAuthConfigured } from "@/lib/auth";

/** API alias for sign-up (same as /sign-up). */
export async function GET(request: Request): Promise<Response> {
  if (!isAuthConfigured()) {
    return Response.json(
      { error: { code: "auth_not_configured", message: "WorkOS env vars are not set." } },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { searchParams } = new URL(request.url);
  const returnTo = searchParams.get("returnTo") ?? undefined;
  const signUpUrl = await getSignUpUrl(returnTo ? { returnTo } : undefined);
  return redirect(signUpUrl);
}
