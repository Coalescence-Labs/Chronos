import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { isAuthConfigured } from "@/lib/auth";
import { requestAuthOrigin } from "@/lib/auth/return-url";
import {
  exchangeGitHubCode,
  fetchGitHubLogin,
  GITHUB_COOKIE_POSTURE,
  githubOAuthCallbackUrl,
  isGitHubOAuthConfigured,
  saveGitHubOAuthSession,
} from "@/lib/github-oauth";

/**
 * GET /api/github/callback — GitHub OAuth code exchange (BFF, decision #7).
 * Seals the access token into an encrypted httpOnly cookie. Never returns the token.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const accountUrl = new URL("/account", request.url);

  if (!isAuthConfigured() || !isGitHubOAuthConfigured()) {
    accountUrl.searchParams.set("github", "error");
    return NextResponse.redirect(accountUrl);
  }

  const { user } = await withAuth({ ensureSignedIn: false });
  if (!user) {
    return NextResponse.redirect(
      new URL("/sign-in?returnTo=%2Faccount", request.url),
    );
  }

  const error = url.searchParams.get("error");
  if (error) {
    accountUrl.searchParams.set("github", "denied");
    return NextResponse.redirect(accountUrl);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const jar = await cookies();
  const expectedState = jar.get(GITHUB_COOKIE_POSTURE.stateCookieName)?.value;
  jar.delete(GITHUB_COOKIE_POSTURE.stateCookieName);

  if (!code || !state || !expectedState || state !== expectedState) {
    accountUrl.searchParams.set("github", "error");
    return NextResponse.redirect(accountUrl);
  }

  try {
    const origin = (await requestAuthOrigin()) ?? new URL(request.url).origin;
    const redirectUri = githubOAuthCallbackUrl(origin);
    const token = await exchangeGitHubCode({ code, redirectUri });
    const login = await fetchGitHubLogin(token.accessToken);
    await saveGitHubOAuthSession({
      accessToken: token.accessToken,
      tokenType: token.tokenType,
      scope: token.scope,
      login,
      workosUserId: user.id,
      connectedAt: new Date().toISOString(),
    });
    accountUrl.searchParams.set("github", "connected");
    return NextResponse.redirect(accountUrl);
  } catch {
    accountUrl.searchParams.set("github", "error");
    return NextResponse.redirect(accountUrl);
  }
}
