import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { isAuthConfigured } from "@/lib/auth";
import {
  buildGitHubAppInstallUrl,
  createInstallState,
  GITHUB_COOKIE_POSTURE,
  isGitHubAppConfigured,
  githubAppSetupUrl,
} from "@/lib/github-app";
import { sealGitHubConnectState } from "@/lib/github-app/user-auth";
import { readGitHubAuthorizationVersion } from "@/lib/github-app/workos-metadata";
import { enforceRequestLimit } from "@/lib/security/request";

/**
 * GET /api/github/connect — start GitHub App install (COA-202).
 * Requires a signed-in WorkOS user. Distinct from WorkOS "Sign in with GitHub".
 */
export async function GET(request: Request): Promise<Response> {
  if (!isAuthConfigured()) {
    return NextResponse.redirect(new URL("/sign-in?returnTo=%2Faccount", request.url));
  }
  if (!isGitHubAppConfigured()) {
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

  const state = createInstallState();
  let authorizationVersion: string;
  try { enforceRequestLimit(request, user.id, "connection"); authorizationVersion = await readGitHubAuthorizationVersion(user.id); }
  catch { return NextResponse.redirect(new URL("/account?github=unavailable", request.url)); }
  const jar = await cookies();
  jar.set(GITHUB_COOKIE_POSTURE.stateCookieName, await sealGitHubConnectState({
    state, workosUserId: user.id, stage: "install",
    redirectUri: githubAppSetupUrl(new URL(request.url).origin),
    authorizationVersion,
  }), {
    httpOnly: true,
    sameSite: "lax",
    secure:
      process.env.NODE_ENV === "production" ||
      (process.env.GITHUB_APP_SETUP_URL?.startsWith("https:") ?? false),
    path: "/",
    maxAge: 60 * 10,
  });

  const installUrl = buildGitHubAppInstallUrl({ state });
  return NextResponse.redirect(installUrl);
}
