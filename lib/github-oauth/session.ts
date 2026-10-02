import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import {
  GITHUB_COOKIE_POSTURE,
  GITHUB_SESSION_MAX_AGE_SECONDS,
  githubSessionPassword,
  isGitHubOAuthConfigured,
} from "./config";
import type { GitHubOAuthSessionData, PublicGitHubConnection } from "./types";

function cookieSecure(): boolean {
  if (process.env.NODE_ENV === "production") return true;
  const callback = process.env.GITHUB_OAUTH_CALLBACK_URL?.trim();
  if (callback) {
    try {
      return new URL(callback).protocol === "https:";
    } catch {
      return false;
    }
  }
  return false;
}

function sessionOptions() {
  const password = githubSessionPassword();
  if (!password) {
    throw new Error("GITHUB_SESSION_PASSWORD is not configured");
  }
  return {
    cookieName: GITHUB_COOKIE_POSTURE.defaultName,
    password,
    ttl: GITHUB_SESSION_MAX_AGE_SECONDS,
    cookieOptions: {
      httpOnly: true,
      secure: cookieSecure(),
      sameSite: GITHUB_COOKIE_POSTURE.sameSite,
      path: "/",
    },
  };
}

export async function getGitHubOAuthSession() {
  return getIronSession<Partial<GitHubOAuthSessionData>>(
    await cookies(),
    sessionOptions(),
  );
}

export async function saveGitHubOAuthSession(
  data: GitHubOAuthSessionData,
): Promise<void> {
  const session = await getGitHubOAuthSession();
  session.accessToken = data.accessToken;
  session.tokenType = data.tokenType;
  session.scope = data.scope;
  session.login = data.login;
  session.workosUserId = data.workosUserId;
  session.connectedAt = data.connectedAt;
  await session.save();
}

export async function destroyGitHubOAuthSession(): Promise<void> {
  if (!isGitHubOAuthConfigured()) return;
  try {
    const session = await getGitHubOAuthSession();
    session.destroy();
  } catch {
    // Unconfigured password or missing cookie store — nothing to clear.
  }
}

/**
 * Read sealed session only when it belongs to the given WorkOS user.
 * Returns undefined (not an error) when absent or mismatched.
 */
export async function readGitHubOAuthSessionForUser(
  workosUserId: string | null | undefined,
): Promise<GitHubOAuthSessionData | undefined> {
  if (!workosUserId || !isGitHubOAuthConfigured()) return undefined;
  try {
    const session = await getGitHubOAuthSession();
    if (
      !session.accessToken ||
      !session.login ||
      !session.workosUserId ||
      session.workosUserId !== workosUserId
    ) {
      return undefined;
    }
    return {
      accessToken: session.accessToken,
      tokenType: session.tokenType ?? "bearer",
      scope: session.scope ?? "",
      login: session.login,
      workosUserId: session.workosUserId,
      connectedAt: session.connectedAt ?? new Date(0).toISOString(),
    };
  } catch {
    return undefined;
  }
}

export function toPublicGitHubConnection(
  session: GitHubOAuthSessionData | undefined,
): PublicGitHubConnection {
  if (!session) {
    return {
      connected: false,
      login: null,
      scope: null,
      configured: isGitHubOAuthConfigured(),
    };
  }
  return {
    connected: true,
    login: session.login,
    scope: session.scope,
    configured: true,
  };
}

/** Reject payloads that would leak the OAuth token into JSON/UI. */
export function assertNoSecretsInPublicGitHubConnection(
  connection: PublicGitHubConnection,
): void {
  const blob = JSON.stringify(connection);
  if (
    /accessToken|access_token|refreshToken|client_secret|GITHUB_OAUTH_CLIENT_SECRET|ghp_|gho_/i.test(
      blob,
    )
  ) {
    throw new Error("Public GitHub connection payload must not include secrets");
  }
}

export function githubSessionCookieLooksHardened(setCookie: string): boolean {
  const lower = setCookie.toLowerCase();
  return lower.includes("httponly") && lower.includes("samesite=lax");
}
