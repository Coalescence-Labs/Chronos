import type { RepoResponse } from "@/lib/ingest/api";
import { githubAuthForRequest, verifiedRepoMeta } from "@/lib/ingest/github/auth";
import { fetchCommitPage, fetchRefs } from "@/lib/ingest/github/fetch";
import { parseRepoInput } from "@/lib/ingest/github/parse";
import { errorResponse, jsonResponse } from "@/lib/ingest/respond";

/**
 * BFF proxy entry point (decisions #3 + #7): resolves a repo URL to the
 * normalized model. Repo data transits this route transiently — nothing
 * is persisted or logged (docs/PRIVACY.md "Ingestion").
 *
 * Connected requests verify the user's repo access before minting a token for
 * the owner's GitHub App installation; otherwise they use the optional public
 * app-pool token or anonymous GitHub access.
 *
 * GET /api/repo?repo=<url or owner/repo>
 * → refs + the first commit page of the default branch; the client backfills
 *   further pages via /api/repo/commits so huge histories never block here.
 */
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  try {
    const id = parseRepoInput(searchParams.get("repo") ?? "");
    const auth = await githubAuthForRequest(id, request);
    const meta = await verifiedRepoMeta(id, auth);
    const [referencePage, firstPage] = await Promise.all([
      fetchRefs(id, auth),
      fetchCommitPage(id, meta.defaultBranch, 1, auth),
    ]);

    const tip = firstPage.commits[0];
    const body: RepoResponse = {
      repo: { ...id, defaultBranch: meta.defaultBranch },
      history: {
        commits: firstPage.commits,
        refs: tip ? [{ name: "HEAD", type: "head", sha: tip.sha }, ...referencePage.refs] : referencePage.refs,
      },
      nextPage: firstPage.hasMore ? 2 : null,
      ...(referencePage.truncated ? { referencesTruncated: true } : {}),
    };
    return jsonResponse(body);
  } catch (error) {
    return errorResponse(error);
  }
}
