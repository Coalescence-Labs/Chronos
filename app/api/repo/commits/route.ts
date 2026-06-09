import type { CommitsPageResponse } from "@/lib/ingest/api";
import { IngestError } from "@/lib/ingest/errors";
import { fetchCommitPage } from "@/lib/ingest/github/fetch";
import { parseRepoInput } from "@/lib/ingest/github/parse";
import { errorResponse, jsonResponse } from "@/lib/ingest/respond";

/**
 * Commit-page backfill for the BFF proxy: one GitHub call per request,
 * client-driven, so 10k+ commit histories stream in pages instead of
 * blocking a single request. Same privacy posture as /api/repo.
 *
 * GET /api/repo/commits?repo=<owner/repo>&sha=<sha or ref>&page=<n>
 */

/** 40-hex sha or a ref name — no whitespace, no path traversal. */
const SHA_OR_REF = /^(?!.*\.\.)[\w./-]{1,255}$/;

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  try {
    const id = parseRepoInput(searchParams.get("repo") ?? "");
    const sha = searchParams.get("sha") ?? "";
    if (!SHA_OR_REF.test(sha)) {
      throw new IngestError("invalid-input", "Invalid commit or branch reference.");
    }
    const page = Number(searchParams.get("page") ?? "1");

    const result = await fetchCommitPage(id, sha, page);
    const body: CommitsPageResponse = {
      commits: result.commits,
      nextPage: result.hasMore ? page + 1 : null,
    };
    return jsonResponse(body);
  } catch (error) {
    return errorResponse(error);
  }
}
