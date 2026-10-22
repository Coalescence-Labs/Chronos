import { isAuthConfigured } from "@/lib/auth/config";
import { isGitHubAppConfigured } from "./config";
import { readGitHubAppSessionForUser } from "./session";
import { readGitHubInstallMetadata, INITIAL_GITHUB_AUTHORIZATION_VERSION } from "./workos-metadata";
import type { GitHubAppSessionData } from "./types";
import { IngestError } from "@/lib/ingest/errors";

export async function peekGitHubInstallBinding(
  workosUserId: string | null | undefined,
): Promise<GitHubAppSessionData | undefined> {
  if (!workosUserId || !isAuthConfigured()) return undefined;
  const binding = await readGitHubInstallMetadata(workosUserId);
  return binding ? { ...binding, workosUserId } : undefined;
}

/** Durable bindings and their revocation version remain authoritative on every request. */
export async function resolveGitHubAppSessionForUser(
  workosUserId: string | null | undefined,
): Promise<GitHubAppSessionData | undefined> {
  if (!workosUserId || !isGitHubAppConfigured() || !isAuthConfigured()) return undefined;
  const [fromCookie, binding] = await Promise.all([
    readGitHubAppSessionForUser(workosUserId), readGitHubInstallMetadata(workosUserId),
  ]);
  if (!binding) return undefined;
  if (!fromCookie) return { ...binding, workosUserId };
  if ((fromCookie.authorizationVersion ?? INITIAL_GITHUB_AUTHORIZATION_VERSION) !==
    (binding.authorizationVersion ?? INITIAL_GITHUB_AUTHORIZATION_VERSION)) {
    throw new IngestError("reconnect-required", "Your GitHub connections changed. Please reconnect GitHub.");
  }
  return {
    ...binding, workosUserId,
    userAccessToken: fromCookie.userAccessToken,
    userRefreshToken: fromCookie.userRefreshToken,
    userTokenExpiresAt: fromCookie.userTokenExpiresAt,
  };
}
