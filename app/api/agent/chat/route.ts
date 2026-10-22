import { withAuth } from "@workos-inc/authkit-nextjs";
import type { RepoHistory } from "@/lib/graph";
import { runAgentTurn } from "@/lib/agent/orchestrate";
import { enforceDistributedRateLimit } from "@/lib/redis/rate-limit";
import { isRedisConfigured } from "@/lib/redis/config";
import { requestRateLimitIdentity } from "@/lib/security/request";
import { IngestError } from "@/lib/ingest/errors";
import { errorResponse } from "@/lib/ingest/respond";
import { githubAuthForRequest } from "@/lib/ingest/github/auth";
import { parseRepoInput } from "@/lib/ingest/github/parse";

const MAX_COMMITS = 2_500;

function parseHistory(raw: unknown): RepoHistory | null {
  if (!raw || typeof raw !== "object") return null;
  const history = raw as RepoHistory;
  if (!Array.isArray(history.commits) || !Array.isArray(history.refs)) return null;
  if (history.commits.length > MAX_COMMITS) return null;
  return history;
}

export async function POST(request: Request): Promise<Response> {
  const { user } = await withAuth({ ensureSignedIn: true });
  try {
    if (isRedisConfigured()) {
      const identity = requestRateLimitIdentity(request, user.id, "agent");
      const limited = await enforceDistributedRateLimit(identity, "agent");
      if (!limited.allowed) {
        throw new IngestError("rate-limited", "Too many Agent requests. Please wait.", limited.retryAfterSeconds);
      }
    }
  } catch (error) {
    if (error instanceof IngestError) return errorResponse(error);
    throw error;
  }

  let body: {
    question?: string;
    owner?: string;
    repo?: string;
    history?: unknown;
    selectedSha?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question : "";
  const owner = typeof body.owner === "string" ? body.owner.trim() : "";
  const repo = typeof body.repo === "string" ? body.repo.trim() : "";
  const history = parseHistory(body.history);
  if (!question.trim() || !owner || !repo || !history) {
    return Response.json({ ok: false, error: "Missing question, repo, or history." }, { status: 400 });
  }

  let githubAuth = null;
  try {
    const repoId = parseRepoInput(`${owner}/${repo}`);
    githubAuth = await githubAuthForRequest(repoId, request);
  } catch {
    githubAuth = null;
  }

  const result = await runAgentTurn({
    workosUserId: user.id,
    userEmail: user.email,
    owner,
    repo,
    question,
    history,
    selectedSha: body.selectedSha,
    githubAuth,
  });

  const status = result.ok ? 200 : result.error?.includes("cap") ? 402 : 403;
  return Response.json(result, { status: result.ok ? 200 : status });
}
