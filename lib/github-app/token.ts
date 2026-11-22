import "server-only";
import { githubAppPoolToken } from "./config";
import { createInstallationAccessToken } from "./install";
import { resolveGitHubAppSessionForUser } from "./resolve-session";
import { githubInstallBindings } from "./bindings";
import { saveGitHubAppSession } from "./session";
import { refreshGitHubUserToken } from "./user-auth";
import { fetchRepoMeta, type GitHubRequestAuth } from "@/lib/ingest/github/fetch";
import type { RepoId } from "@/lib/ingest/github/parse";
import { coordinateGitHubRefresh, waitForSharedCredential } from "./coordination";
import { IngestError } from "@/lib/ingest/errors";
import type { GitHubAppSessionData } from "./types";
import { readStoredGitHubCredentials, storeGitHubCredentials } from "./credential-store";
import { INITIAL_GITHUB_AUTHORIZATION_VERSION } from "./workos-metadata";

/**
 * Resolve which GitHub credential the BFF should use for a request.
 *
 * Priority (COA-202 / GitHub App):
 * 1. Verify user repo access, then mint a token for the matching installation
 * 2. Optional server `GITHUB_TOKEN` app pool (anonymous / unconnected)
 * 3. Unauthenticated (shared GitHub anonymous budget)
 */
export async function resolveGitHubRequestAuth(
  workosUserId: string | null | undefined,
  repo: RepoId,
  signal?: AbortSignal,
): Promise<GitHubRequestAuth> {
  signal?.throwIfAborted();
  const userSession = await resolveGitHubAppSessionForUser(workosUserId);
  signal?.throwIfAborted();
  const binding = userSession && githubInstallBindings(userSession).find((install) =>
    install.accountLogin.toLowerCase() === repo.owner.toLowerCase(),
  );
  if (binding && userSession?.userAccessToken) {
    const userToken = await activeGitHubUserToken(userSession, signal);
    // Installation tokens cover the whole installation; user access may be narrower.
    signal?.throwIfAborted();
    const repoMeta = await fetchRepoMeta(repo, { accessToken: userToken, signal });
    const accessToken = await waitForSharedCredential(createInstallationAccessToken(binding.installationId, repo), signal);
    signal?.throwIfAborted();
    return { accessToken, privateAccessVerified: true, repoMeta, signal };
  }
  return { accessToken: githubAppPoolToken(), privateAccessVerified: false, signal };
}

export async function activeGitHubUserToken(session: GitHubAppSessionData, signal?: AbortSignal): Promise<string> {
  if (!session.userAccessToken) throw new IngestError("reconnect-required", "Reconnect GitHub to verify your repository access.");
  if (!session.userTokenExpiresAt || session.userTokenExpiresAt >= Date.now() + 60_000) return session.userAccessToken;
  if (!session.userRefreshToken) throw new IngestError("reconnect-required", "GitHub authorization expired. Reconnect GitHub in your account.");
  let refreshed: Awaited<ReturnType<typeof refreshGitHubUserToken>>;
  try {
    refreshed = await waitForSharedCredential(coordinateGitHubRefresh(session.workosUserId, session.userRefreshToken,
      () => refreshGitHubUserToken(session.userRefreshToken!)), signal);
  } catch (error) {
    // GitHub refresh tokens are single-use. If another instance (or an
    // earlier request whose response never reached the browser) already
    // rotated this one, its successor is in Vault — adopt it instead of
    // stranding the connection.
    const rotated = error instanceof IngestError && error.code === "auth-refreshing"
      ? await rotatedElsewhere(session) : undefined;
    if (!rotated) throw error;
    await cacheInCookie({ ...session, ...rotated });
    return rotated.userAccessToken;
  }
  // Durable copy first: if the cookie never reaches the browser, the next
  // request still finds the rotated refresh token.
  await storeGitHubCredentials(session.workosUserId, { ...refreshed, authorizationVersion: session.authorizationVersion });
  await cacheInCookie({ ...session, ...refreshed });
  return refreshed.userAccessToken!;
}

async function rotatedElsewhere(session: GitHubAppSessionData) {
  const stored = await readStoredGitHubCredentials(session.workosUserId);
  if (!stored || stored.userRefreshToken === session.userRefreshToken) return undefined;
  if ((stored.authorizationVersion ?? INITIAL_GITHUB_AUTHORIZATION_VERSION) !==
    (session.authorizationVersion ?? INITIAL_GITHUB_AUTHORIZATION_VERSION)) return undefined;
  if (stored.userTokenExpiresAt && stored.userTokenExpiresAt < Date.now() + 60_000) return undefined;
  return stored;
}

/** The cookie is a cache now; a context that can't set cookies must not fail the request. */
async function cacheInCookie(session: GitHubAppSessionData): Promise<void> {
  try { await saveGitHubAppSession(session); } catch { /* Vault holds the durable copy. */ }
}

export async function resolveGitHubAccessToken(
  workosUserId: string | null | undefined,
  repo: RepoId,
): Promise<string | undefined> {
  return (await resolveGitHubRequestAuth(workosUserId, repo)).accessToken;
}
