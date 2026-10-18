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
  const refreshed = await waitForSharedCredential(coordinateGitHubRefresh(session.workosUserId, session.userRefreshToken,
    () => refreshGitHubUserToken(session.userRefreshToken!)), signal);
  await saveGitHubAppSession({ ...session, ...refreshed });
  return refreshed.userAccessToken!;
}

export async function resolveGitHubAccessToken(
  workosUserId: string | null | undefined,
  repo: RepoId,
): Promise<string | undefined> {
  return (await resolveGitHubRequestAuth(workosUserId, repo)).accessToken;
}
