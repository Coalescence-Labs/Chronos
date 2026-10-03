import { githubAppPoolToken } from "./config";
import { createInstallationAccessToken } from "./install";
import { resolveGitHubAppSessionForUser } from "./resolve-session";

/**
 * Resolve which GitHub credential the BFF should use for a request.
 *
 * Priority (COA-202 / GitHub App):
 * 1. Mint installation access token from sealed installation id
 * 2. Optional server `GITHUB_TOKEN` app pool (anonymous / unconnected)
 * 3. Unauthenticated (shared GitHub anonymous budget)
 */
export async function resolveGitHubAccessToken(
  workosUserId: string | null | undefined,
): Promise<string | undefined> {
  const userSession = await resolveGitHubAppSessionForUser(workosUserId, {
    persistSession: true,
  });
  if (userSession) {
    try {
      return await createInstallationAccessToken(userSession.installationId);
    } catch {
      // Installation revoked or App misconfigured — fall through to pool.
    }
  }
  return githubAppPoolToken();
}
