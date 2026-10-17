import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { isAuthConfigured } from "@/lib/auth";
import {
  fetchInstallationAccount,
  GITHUB_APP_PERMISSIONS,
  GITHUB_COOKIE_POSTURE,
  isGitHubAppConfigured,
  peekGitHubInstallBinding,
  saveGitHubAppSession,
  writeGitHubInstallMetadata,
  createInstallState,
} from "@/lib/github-app";
import { mergeGitHubInstallation } from "@/lib/github-app/bindings";
import {
  assertGitHubUserInstallation,
  buildGitHubUserAuthorizeUrl,
  exchangeGitHubUserCode,
  readGitHubConnectState,
  sealGitHubConnectState,
} from "@/lib/github-app/user-auth";

/**
 * GET /api/github/callback — GitHub App setup redirect after install.
 * Seals installationId (+ account login) into encrypted httpOnly gh-session.
 * Never returns tokens. Configure this path as the App Setup URL.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const accountUrl = new URL("/account", request.url);

  if (!isAuthConfigured() || !isGitHubAppConfigured()) {
    accountUrl.searchParams.set("github", "error");
    return NextResponse.redirect(accountUrl);
  }

  const { user } = await withAuth({ ensureSignedIn: false });
  if (!user) {
    return NextResponse.redirect(
      new URL("/sign-in?returnTo=%2Faccount", request.url),
    );
  }

  const state = url.searchParams.get("state");
  const jar = await cookies();
  const pending = await readGitHubConnectState(jar.get(GITHUB_COOKIE_POSTURE.stateCookieName)?.value);
  jar.delete(GITHUB_COOKIE_POSTURE.stateCookieName);
  if (
    !state || state !== pending.state || pending.workosUserId !== user.id || !pending.redirectUri
  ) {
    accountUrl.searchParams.set("github", "error");
    return NextResponse.redirect(accountUrl);
  }

  if (url.searchParams.has("error")) {
    accountUrl.searchParams.set("github", "denied");
    return NextResponse.redirect(accountUrl);
  }

  if (url.searchParams.get("setup_action") === "request") {
    accountUrl.searchParams.set("github", "pending");
    return NextResponse.redirect(accountUrl);
  }

  try {
    if (pending.stage === "install") {
      const installationId = Number(url.searchParams.get("installation_id"));
      if (!Number.isSafeInteger(installationId) || installationId <= 0) throw new Error("Invalid installation");
      const authorize = {
        state: createInstallState(), workosUserId: user.id, stage: "authorize" as const,
        installationId, redirectUri: pending.redirectUri,
      };
      jar.set(GITHUB_COOKIE_POSTURE.stateCookieName, await sealGitHubConnectState(authorize), {
        httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" ||
          new URL(pending.redirectUri).protocol === "https:", path: "/", maxAge: 600,
      });
      return NextResponse.redirect(buildGitHubUserAuthorizeUrl(authorize));
    }
    const installationId = pending.installationId;
    const code = url.searchParams.get("code");
    if (pending.stage !== "authorize" || !installationId || !code) throw new Error("Invalid authorization");
    const credentials = await exchangeGitHubUserCode(code, pending.redirectUri);
    await assertGitHubUserInstallation(credentials.userAccessToken!, installationId);
    const account = await fetchInstallationAccount(installationId);
    // Re-entering via "Change repos" updates the same installation — keep its original date.
    const existing = await peekGitHubInstallBinding(user.id);
    const session = mergeGitHubInstallation(existing, {
      installationId: account.installationId,
      accountLogin: account.accountLogin,
      accountType: account.accountType,
      workosUserId: user.id,
      connectedAt: new Date().toISOString(),
      permissions: GITHUB_APP_PERMISSIONS.join(","),
      ...credentials,
    });
    // Durable binding first — if the cookie save fails, sign-in can still rehydrate.
    await writeGitHubInstallMetadata(user.id, session);
    await saveGitHubAppSession(session);
    accountUrl.searchParams.set("github", "connected");
    return NextResponse.redirect(accountUrl);
  } catch {
    accountUrl.searchParams.set("github", "error");
    return NextResponse.redirect(accountUrl);
  }
}
