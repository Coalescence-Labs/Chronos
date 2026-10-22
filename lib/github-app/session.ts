import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { devOnlyMissingEnvVarNames, stripDevMissingEnvVarNames } from "@/lib/env/deployment";
import {
  GITHUB_COOKIE_POSTURE,
  GITHUB_SESSION_MAX_AGE_SECONDS,
  githubAppMissingEnvVarNames,
  githubSessionPassword,
  isGitHubAppConfigured,
} from "./config";
import type { GitHubAppSessionData, PublicGitHubConnection } from "./types";
import { githubInstallBindings } from "./bindings";

function cookieSecure(): boolean {
  if (process.env.NODE_ENV === "production") return true;
  const setup = process.env.GITHUB_APP_SETUP_URL?.trim();
  if (setup) {
    try {
      return new URL(setup).protocol === "https:";
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

export async function getGitHubAppSession() {
  return getIronSession<Partial<GitHubAppSessionData>>(
    await cookies(),
    sessionOptions(),
  );
}

export async function saveGitHubAppSession(
  data: GitHubAppSessionData,
): Promise<void> {
  const session = await getGitHubAppSession();
  session.installationId = data.installationId;
  session.accountLogin = data.accountLogin;
  session.accountType = data.accountType;
  session.workosUserId = data.workosUserId;
  session.connectedAt = data.connectedAt;
  session.permissions = data.permissions;
  session.additionalInstallations = data.additionalInstallations;
  session.userAccessToken = data.userAccessToken;
  session.userRefreshToken = data.userRefreshToken;
  session.userTokenExpiresAt = data.userTokenExpiresAt;
  session.authorizationVersion = data.authorizationVersion;
  await session.save();
}

export async function destroyGitHubAppSession(): Promise<void> {
  if (!githubSessionPassword()) return;
  try {
    const session = await getGitHubAppSession();
    session.destroy();
  } catch {
    // Unconfigured password or missing cookie store — nothing to clear.
  }
}

/**
 * Read sealed session only when it belongs to the given WorkOS user.
 * Returns undefined (not an error) when absent or mismatched.
 */
export async function readGitHubAppSessionForUser(
  workosUserId: string | null | undefined,
): Promise<GitHubAppSessionData | undefined> {
  if (!workosUserId || !isGitHubAppConfigured()) return undefined;
  try {
    const session = await getGitHubAppSession();
    if (
      typeof session.installationId !== "number" ||
      !session.accountLogin ||
      !session.workosUserId ||
      session.workosUserId !== workosUserId
    ) {
      return undefined;
    }
    return {
      installationId: session.installationId,
      accountLogin: session.accountLogin,
      accountType: session.accountType === "Organization" ? "Organization" : "User",
      workosUserId: session.workosUserId,
      connectedAt: session.connectedAt ?? new Date(0).toISOString(),
      permissions: session.permissions ?? "contents:read,metadata:read",
      ...(session.additionalInstallations?.length
        ? { additionalInstallations: session.additionalInstallations }
        : {}),
      ...(session.userAccessToken ? { userAccessToken: session.userAccessToken } : {}),
      ...(session.userRefreshToken ? { userRefreshToken: session.userRefreshToken } : {}),
      ...(session.userTokenExpiresAt ? { userTokenExpiresAt: session.userTokenExpiresAt } : {}),
      ...(session.authorizationVersion ? { authorizationVersion: session.authorizationVersion } : {}),
    };
  } catch {
    return undefined;
  }
}

function githubConnectionDevHints(
  configured: boolean,
): Pick<PublicGitHubConnection, "missingEnvVars"> {
  if (configured) return {};
  const missingEnvVars = devOnlyMissingEnvVarNames(githubAppMissingEnvVarNames());
  return missingEnvVars ? { missingEnvVars } : {};
}

export function toPublicGitHubConnection(
  session: GitHubAppSessionData | undefined,
): PublicGitHubConnection {
  if (!session) {
    const configured = isGitHubAppConfigured();
    return {
      connected: false,
      login: null,
      permissions: null,
      connectedAt: null,
      configured,
      state: "disconnected",
      ...githubConnectionDevHints(configured),
    };
  }
  // readGitHubAppSessionForUser backfills the epoch for legacy sessions — not a real date.
  const connectedAtMs = Date.parse(session.connectedAt);
  return {
    connected: Boolean(session.userAccessToken && (!session.userTokenExpiresAt || session.userTokenExpiresAt > Date.now())),
    state: session.userAccessToken && (!session.userTokenExpiresAt || session.userTokenExpiresAt > Date.now()) ? "connected" : "reconnect-required",
    login: session.accountLogin,
    permissions: session.permissions,
    connectedAt: connectedAtMs > 0 ? session.connectedAt : null,
    configured: true,
    accounts: githubInstallBindings(session).map((binding) => ({
      login: binding.accountLogin, accountType: binding.accountType,
      connectedAt: Date.parse(binding.connectedAt) > 0 ? binding.connectedAt : null,
    })),
  };
}

/** Strip dev-only fields before JSON leaves the server in non-development deployments. */
export function publicGitHubConnectionForResponse(
  connection: PublicGitHubConnection,
): PublicGitHubConnection {
  return stripDevMissingEnvVarNames(connection);
}

/** Reject payloads that would leak tokens / private keys into JSON/UI. */
export function assertNoSecretsInPublicGitHubConnection(
  connection: PublicGitHubConnection,
): void {
  const blob = JSON.stringify(connection);
  if (
    /accessToken|access_token|refreshToken|private_key|GITHUB_APP_PRIVATE_KEY|installationId|ghs_|ghp_|gho_|ghu_|ghr_/i.test(
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
