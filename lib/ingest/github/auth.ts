import { withAuth } from "@workos-inc/authkit-nextjs";
import { resolveGitHubAccessToken } from "@/lib/github-oauth";
import type { GitHubRequestAuth } from "@/lib/ingest/github/fetch";

/**
 * Resolve BFF GitHub auth for the current request cookies.
 * Prefers the account-linked OAuth token; falls back to app pool / anonymous.
 */
export async function githubAuthForRequest(): Promise<GitHubRequestAuth> {
  let workosUserId: string | null = null;
  try {
    const { user } = await withAuth({ ensureSignedIn: false });
    workosUserId = user?.id ?? null;
  } catch {
    // WorkOS unconfigured or proxy skip — treat as anonymous.
  }
  const accessToken = await resolveGitHubAccessToken(workosUserId);
  return accessToken ? { accessToken } : {};
}
