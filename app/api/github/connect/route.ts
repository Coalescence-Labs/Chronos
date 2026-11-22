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
import { createGitHubCodeVerifier, buildGitHubUserAuthorizeUrl, sealGitHubConnectState } from "@/lib/github-app/user-auth";
import { readGitHubInstallMetadata } from "@/lib/github-app/workos-metadata";
import { sanitizeReturnPath } from "@/lib/auth/return-to";
import { readGitHubAuthorizationVersion } from "@/lib/github-app/workos-metadata";
import { enforceRequestLimitAsync } from "@/lib/security/request";

/**
 * GET /api/github/connect — start GitHub App install (COA-202).
 * Requires a signed-in WorkOS user. Distinct from WorkOS "Sign in with GitHub".
 *
 * `?reconnect=1` (COA-747): when the user already has a saved installation,
 * skip GitHub's install/configure page and go straight to user authorization
 * for that installation — GitHub returns immediately if Chronos is still
 * authorized, so a lost credential is one click to restore. The callback
 * still verifies the user's access to the installation before saving.
 * `?returnTo=/repo/o/r` lands back where the user started.
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
  const params = new URL(request.url).searchParams;
  const rawReturn = params.get("returnTo");
  // Unsafe or empty paths sanitize to "/"; treat that as "no returnTo" (→ /account).
  const sanitized = rawReturn ? sanitizeReturnPath(rawReturn) : "/";
  const returnTo = sanitized === "/" ? undefined : sanitized;
  let authorizationVersion: string;
  let reconnectInstallationId: number | undefined;
  try {
    await enforceRequestLimitAsync(request, user.id, "connection");
    authorizationVersion = await readGitHubAuthorizationVersion(user.id);
    if (params.get("reconnect") === "1") {
      reconnectInstallationId = (await readGitHubInstallMetadata(user.id))?.installationId;
    }
  } catch { return NextResponse.redirect(new URL("/account?github=unavailable", request.url)); }
  const redirectUri = githubAppSetupUrl(new URL(request.url).origin);
  const connectState = reconnectInstallationId
    ? {
        state, workosUserId: user.id, stage: "authorize" as const, redirectUri,
        installationId: reconnectInstallationId, codeVerifier: createGitHubCodeVerifier(),
        authorizationVersion, ...(returnTo ? { returnTo } : {}),
      }
    : {
        state, workosUserId: user.id, stage: "install" as const, redirectUri,
        authorizationVersion, ...(returnTo ? { returnTo } : {}),
      };
  const jar = await cookies();
  jar.set(GITHUB_COOKIE_POSTURE.stateCookieName, await sealGitHubConnectState(connectState), {
    httpOnly: true,
    sameSite: "lax",
    secure:
      process.env.NODE_ENV === "production" ||
      (process.env.GITHUB_APP_SETUP_URL?.startsWith("https:") ?? false),
    path: "/",
    maxAge: 60 * 10,
  });

  return NextResponse.redirect(connectState.stage === "authorize"
    ? buildGitHubUserAuthorizeUrl(connectState)
    : buildGitHubAppInstallUrl({ state }));
}
