import type { RepoResponse } from "@/lib/ingest/api";
import { fetchCommitPage, fetchRefs, fetchRepoMeta } from "@/lib/ingest/github/fetch";
import { parseRepoInput } from "@/lib/ingest/github/parse";
import { errorResponse, jsonResponse } from "@/lib/ingest/respond";

/**
 * BFF proxy entry point (decisions #3 + #7): resolves a public repo URL to
 * the normalized model. Repo data transits this route transiently — nothing
 * is persisted or logged (docs/PRIVACY.md "Ingestion").
 *
 * GET /api/repo?repo=<url or owner/repo>
 * → refs + the first commit page of the default branch; the client backfills
 *   further pages via /api/repo/commits so huge histories never block here.
 */
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  try {
    const id = parseRepoInput(searchParams.get("repo") ?? "");
    const meta = await fetchRepoMeta(id);
    const [refs, firstPage] = await Promise.all([
      fetchRefs(id),
      fetchCommitPage(id, meta.defaultBranch, 1),
    ]);

    const tip = firstPage.commits[0];
    const body: RepoResponse = {
      repo: { ...id, defaultBranch: meta.defaultBranch },
      history: {
        commits: firstPage.commits,
        refs: tip ? [{ name: "HEAD", type: "head", sha: tip.sha }, ...refs] : refs,
      },
      nextPage: firstPage.hasMore ? 2 : null,
    };
    return jsonResponse(body);
  } catch (error) {
    return errorResponse(error);
  }
}
