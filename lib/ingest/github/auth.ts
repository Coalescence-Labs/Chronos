import { resolveGitHubRequestAuth } from "@/lib/github-app";
import { IngestError } from "../errors";
import { fetchRepoMeta, type RepoMeta } from "./fetch";
import { enforceRequestLimitAsync } from "@/lib/security/request";
import type { GitHubRequestAuth } from "@/lib/ingest/github/fetch";
import type { RepoId } from "./parse";

/**
 * Resolve BFF GitHub auth for the current request cookies.
 * Prefers a mint of the connected GitHub App installation token;
 * falls back to app pool / anonymous.
 *
 * AuthKit is loaded dynamically so bun unit tests that import `/api/repo`
 * do not pull `server-only` into the static module graph.
 */
export async function githubAuthForRequest(repo: RepoId, request?: Request): Promise<GitHubRequestAuth> {
  const deadline = AbortSignal.timeout(20_000);
  const signal = request ? AbortSignal.any([request.signal, deadline]) : deadline;
  let workosUserId: string | null = null;
  try {
    const { withAuth } = await import("@workos-inc/authkit-nextjs");
    const { user } = await withAuth({ ensureSignedIn: false });
    workosUserId = user?.id ?? null;
  } catch {
    // WorkOS unconfigured, outside Next runtime, or proxy skip — anonymous.
  }
  if (request) await enforceRequestLimitAsync(request, workosUserId);
  return resolveGitHubRequestAuth(workosUserId, repo, signal);
}

export async function verifiedRepoMeta(repo: RepoId, auth: GitHubRequestAuth): Promise<RepoMeta> {
  const meta = auth.repoMeta ?? await fetchRepoMeta(repo, auth);
  if (meta.private && auth.privateAccessVerified !== true) {
    throw new IngestError("not-found", "Repository not found. Connect GitHub and select this repository to read private history.");
  }
  return meta;
}
