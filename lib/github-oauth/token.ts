import { githubAppPoolToken } from "./config";
import { readGitHubOAuthSessionForUser } from "./session";

/**
 * Resolve which GitHub credential the BFF should use for a request.
 *
 * Priority (COA-202):
 * 1. Connected user OAuth token (when WorkOS user matches sealed session)
 * 2. Optional server `GITHUB_TOKEN` app pool (anonymous / unconnected)
 * 3. Unauthenticated (shared GitHub anonymous budget)
 */
export async function resolveGitHubAccessToken(
  workosUserId: string | null | undefined,
): Promise<string | undefined> {
  const userSession = await readGitHubOAuthSessionForUser(workosUserId);
  if (userSession?.accessToken) return userSession.accessToken;
  return githubAppPoolToken();
}
