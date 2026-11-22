import { isAuthConfigured } from "@/lib/auth/config";
import { isGitHubAppConfigured } from "./config";
import { readGitHubAppSessionForUser } from "./session";
import { readGitHubInstallMetadata, INITIAL_GITHUB_AUTHORIZATION_VERSION } from "./workos-metadata";
import type { GitHubAppSessionData } from "./types";
import { IngestError } from "@/lib/ingest/errors";
import {
  readStoredGitHubCredentials,
  storeGitHubCredentials,
  type GitHubUserCredentialFields,
} from "./credential-store";

export async function peekGitHubInstallBinding(
  workosUserId: string | null | undefined,
): Promise<GitHubAppSessionData | undefined> {
  if (!workosUserId || !isAuthConfigured()) return undefined;
  const binding = await readGitHubInstallMetadata(workosUserId);
  return binding ? { ...binding, workosUserId } : undefined;
}

/**
 * Durable bindings and their revocation version remain authoritative on every
 * request. Credentials come from whichever copy is freshest among the Vault
 * record (durable, survives sign-out / new devices / lost cookies) and the
 * sealed cookie (fast cache), as long as it was issued under the current
 * authorization version — Disconnect rotates the version, so a stale copy of
 * either kind can never regain access.
 */
export async function resolveGitHubAppSessionForUser(
  workosUserId: string | null | undefined,
): Promise<GitHubAppSessionData | undefined> {
  if (!workosUserId || !isGitHubAppConfigured() || !isAuthConfigured()) return undefined;
  const [fromCookie, binding, stored] = await Promise.all([
    readGitHubAppSessionForUser(workosUserId),
    readGitHubInstallMetadata(workosUserId),
    readStoredGitHubCredentials(workosUserId),
  ]);
  if (!binding) return undefined;
  const version = binding.authorizationVersion ?? INITIAL_GITHUB_AUTHORIZATION_VERSION;
  const current = (candidate?: { authorizationVersion?: string }) =>
    (candidate?.authorizationVersion ?? INITIAL_GITHUB_AUTHORIZATION_VERSION) === version;
  const cookieCredentials: GitHubUserCredentialFields | undefined =
    fromCookie?.userAccessToken && current(fromCookie) ? fromCookie : undefined;
  const storedCredentials: GitHubUserCredentialFields | undefined = stored && current(stored) ? stored : undefined;
  if (fromCookie && !current(fromCookie) && !storedCredentials) {
    throw new IngestError("reconnect-required", "Your GitHub connections changed. Please reconnect GitHub.");
  }
  const credentials = freshest(cookieCredentials, storedCredentials);
  // Heal the durable copy from the cookie: first request after this ships, or
  // after a Vault write that failed during a refresh.
  if (credentials && credentials === cookieCredentials &&
    credentials.userRefreshToken !== storedCredentials?.userRefreshToken) {
    await storeGitHubCredentials(workosUserId, { ...pickCredentials(credentials), authorizationVersion: version });
  }
  return {
    ...binding, workosUserId,
    ...(credentials ? pickCredentials(credentials) : {}),
  };
}

function pickCredentials(source: GitHubUserCredentialFields): GitHubUserCredentialFields {
  return {
    userAccessToken: source.userAccessToken,
    userRefreshToken: source.userRefreshToken,
    userTokenExpiresAt: source.userTokenExpiresAt,
  };
}

/** Later expiry = later rotation; tokens without expiry never go stale. */
function freshest<T extends GitHubUserCredentialFields>(a: T | undefined, b: T | undefined): T | undefined {
  if (!a || !b) return a ?? b;
  const expiry = (c: T) => c.userTokenExpiresAt ?? Number.POSITIVE_INFINITY;
  return expiry(b) > expiry(a) ? b : a;
}
