import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { isAuthConfigured } from "@/lib/auth";
import { requestAuthOrigin } from "@/lib/auth/return-url";
import {
  buildGitHubAuthorizeUrl,
  createOAuthState,
  GITHUB_COOKIE_POSTURE,
  githubOAuthCallbackUrl,
  isGitHubOAuthConfigured,
} from "@/lib/github-oauth";

/**
 * GET /api/github/connect — start GitHub repo OAuth (COA-202).
 * Requires a signed-in WorkOS user. Distinct from WorkOS "Sign in with GitHub".
 */
export async function GET(request: Request): Promise<Response> {
  if (!isAuthConfigured()) {
    return NextResponse.redirect(new URL("/sign-in?returnTo=%2Faccount", request.url));
  }
  if (!isGitHubOAuthConfigured()) {
    return NextResponse.redirect(
      new URL("/account?github=unconfigured", request.url),
    );
  }

  const { user } = await withAuth({ ensureSignedIn: false });
  if (!user) {
    return NextResponse.redirect(
      new URL("/sign-in?returnTo=%2Faccount", request.url),
    );
  }

  const origin = (await requestAuthOrigin()) ?? new URL(request.url).origin;
  const redirectUri = githubOAuthCallbackUrl(origin);
  const state = createOAuthState();

  const jar = await cookies();
  jar.set(GITHUB_COOKIE_POSTURE.stateCookieName, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" || redirectUri.startsWith("https:"),
    path: "/",
    maxAge: 60 * 10,
  });

  const authorizeUrl = buildGitHubAuthorizeUrl({ state, redirectUri });
  return NextResponse.redirect(authorizeUrl);
}
