import { resolveGitHubAccessToken } from "@/lib/github-app";
import type { GitHubRequestAuth } from "@/lib/ingest/github/fetch";

/**
 * Resolve BFF GitHub auth for the current request cookies.
 * Prefers a mint of the connected GitHub App installation token;
 * falls back to app pool / anonymous.
 *
 * AuthKit is loaded dynamically so bun unit tests that import `/api/repo`
 * do not pull `server-only` into the static module graph.
 */
export async function githubAuthForRequest(): Promise<GitHubRequestAuth> {
  let workosUserId: string | null = null;
  try {
    const { withAuth } = await import("@workos-inc/authkit-nextjs");
    const { user } = await withAuth({ ensureSignedIn: false });
    workosUserId = user?.id ?? null;
  } catch {
    // WorkOS unconfigured, outside Next runtime, or proxy skip — anonymous.
  }
  const accessToken = await resolveGitHubAccessToken(workosUserId);
  return accessToken ? { accessToken } : {};
}
