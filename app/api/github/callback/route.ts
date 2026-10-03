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
} from "@/lib/github-app";

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

  const error = url.searchParams.get("error");
  if (error) {
    accountUrl.searchParams.set("github", "denied");
    return NextResponse.redirect(accountUrl);
  }

  const installationIdRaw = url.searchParams.get("installation_id");
  const state = url.searchParams.get("state");
  const jar = await cookies();
  const expectedState = jar.get(GITHUB_COOKIE_POSTURE.stateCookieName)?.value;
  jar.delete(GITHUB_COOKIE_POSTURE.stateCookieName);

  const installationId = installationIdRaw
    ? Number.parseInt(installationIdRaw, 10)
    : NaN;

  if (
    !Number.isFinite(installationId) ||
    installationId <= 0 ||
    !state ||
    !expectedState ||
    state !== expectedState
  ) {
    accountUrl.searchParams.set("github", "error");
    return NextResponse.redirect(accountUrl);
  }

  try {
    const account = await fetchInstallationAccount(installationId);
    // Re-entering via "Change repos" updates the same installation — keep its original date.
    const existing = await peekGitHubInstallBinding(user.id);
    const connectedAt =
      existing?.installationId === account.installationId
        ? existing.connectedAt
        : new Date().toISOString();
    const session = {
      installationId: account.installationId,
      accountLogin: account.accountLogin,
      accountType: account.accountType,
      workosUserId: user.id,
      connectedAt,
      permissions: GITHUB_APP_PERMISSIONS.join(","),
    };
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
