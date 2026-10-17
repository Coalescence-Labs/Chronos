import { githubAppPoolToken } from "./config";
import { createInstallationAccessToken } from "./install";
import { resolveGitHubAppSessionForUser } from "./resolve-session";
import { githubInstallBindings } from "./bindings";
import { saveGitHubAppSession } from "./session";
import { refreshGitHubUserToken } from "./user-auth";
import { fetchRepoMeta } from "@/lib/ingest/github/fetch";
import type { RepoId } from "@/lib/ingest/github/parse";

/**
 * Resolve which GitHub credential the BFF should use for a request.
 *
 * Priority (COA-202 / GitHub App):
 * 1. Verify user repo access, then mint a token for the matching installation
 * 2. Optional server `GITHUB_TOKEN` app pool (anonymous / unconnected)
 * 3. Unauthenticated (shared GitHub anonymous budget)
 */
export async function resolveGitHubAccessToken(
  workosUserId: string | null | undefined,
  repo: RepoId,
): Promise<string | undefined> {
  const userSession = await resolveGitHubAppSessionForUser(workosUserId, {
    persistSession: true,
  });
  const binding = userSession && githubInstallBindings(userSession).find((install) =>
    install.accountLogin.toLowerCase() === repo.owner.toLowerCase(),
  );
  if (binding && userSession?.userAccessToken) {
    let userToken = userSession.userAccessToken;
    if (userSession.userTokenExpiresAt && userSession.userTokenExpiresAt < Date.now() + 60_000) {
      if (!userSession.userRefreshToken) return githubAppPoolToken();
      const refreshed = await refreshGitHubUserToken(userSession.userRefreshToken);
      await saveGitHubAppSession({ ...userSession, ...refreshed });
      userToken = refreshed.userAccessToken!;
    }
    // Installation tokens cover the whole installation; user access may be narrower.
    await fetchRepoMeta(repo, { accessToken: userToken });
    try {
      return await createInstallationAccessToken(binding.installationId);
    } catch {
      // Installation revoked or App misconfigured — fall through to pool.
    }
  }
  return githubAppPoolToken();
}
