import { withAuth } from "@workos-inc/authkit-nextjs";
import type { RepoHistory } from "@/lib/graph";
import { generateAgentStarters } from "@/lib/agent/starters";
import { isAuthConfigured } from "@/lib/auth/config";
import { enforceDistributedRateLimit } from "@/lib/redis/rate-limit";
import { isRedisConfigured } from "@/lib/redis/config";
import { requestRateLimitIdentity } from "@/lib/security/request";
import { IngestError } from "@/lib/ingest/errors";
import { errorResponse } from "@/lib/ingest/respond";

const MAX_COMMITS = 2_500;

function parseHistory(raw: unknown): RepoHistory | null {
  if (!raw || typeof raw !== "object") return null;
  const history = raw as RepoHistory;
  if (!Array.isArray(history.commits) || !Array.isArray(history.refs)) return null;
  if (history.commits.length > MAX_COMMITS) return null;
  return history;
}

export async function POST(request: Request): Promise<Response> {
  if (!isAuthConfigured()) {
    return Response.json({ ok: false, error: "Sign in required." }, { status: 401 });
  }
  const { user } = await withAuth({ ensureSignedIn: true });
  try {
    if (isRedisConfigured()) {
      const identity = requestRateLimitIdentity(request, user.id, "agent");
      const limited = await enforceDistributedRateLimit(identity, "agent");
      if (!limited.allowed) {
        throw new IngestError(
          "rate-limited",
          "Too many Agent requests. Please wait.",
          limited.retryAfterSeconds,
        );
      }
    }
  } catch (error) {
    if (error instanceof IngestError) return errorResponse(error);
    throw error;
  }

  let body: {
    owner?: string;
    repo?: string;
    history?: unknown;
    defaultBranch?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const owner = typeof body.owner === "string" ? body.owner.trim() : "";
  const repo = typeof body.repo === "string" ? body.repo.trim() : "";
  const history = parseHistory(body.history);
  const defaultBranch =
    typeof body.defaultBranch === "string" ? body.defaultBranch.trim() : undefined;

  if (!owner || !repo || !history) {
    return Response.json({ ok: false, error: "Missing repo or history." }, { status: 400 });
  }

  const result = await generateAgentStarters({
    workosUserId: user.id,
    userEmail: user.email,
    owner,
    repo,
    history,
    defaultBranch: defaultBranch || undefined,
  });

  // Always return starters (generated/cached or static fallback) so the empty state never blocks.
  return Response.json(
    {
      ok: result.ok,
      starters: result.starters,
      source: result.source,
      ...(result.snapshotHash ? { snapshotHash: result.snapshotHash } : {}),
      ...(result.cacheReadMs !== undefined ? { cacheReadMs: result.cacheReadMs } : {}),
      ...(result.error ? { error: result.error } : {}),
    },
    { status: 200 },
  );
}
