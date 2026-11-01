import { withAuth } from "@workos-inc/authkit-nextjs";
import { parseAgentHistory } from "@/lib/agent/history-input";
import { generateAgentStarters } from "@/lib/agent/starters";
import { assertPublicRepoForAgent } from "@/lib/agent/public-repo";
import { isAuthConfigured } from "@/lib/auth/config";
import { enforceRequestLimitAsync, isSameOriginMutation } from "@/lib/security/request";
import { IngestError } from "@/lib/ingest/errors";
import { errorResponse } from "@/lib/ingest/respond";
import { githubAuthForRequest } from "@/lib/ingest/github/auth";
import { parseRepoInput } from "@/lib/ingest/github/parse";

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginMutation(request)) {
    return Response.json({ ok: false, error: "Forbidden", starters: [], source: "fallback" }, { status: 403 });
  }
  if (!isAuthConfigured()) {
    return Response.json({ ok: false, error: "Sign in required." }, { status: 401 });
  }
  const { user } = await withAuth({ ensureSignedIn: true });
  try {
    await enforceRequestLimitAsync(request, user.id, "agent");
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
  const history = parseAgentHistory(body.history);
  const defaultBranch =
    typeof body.defaultBranch === "string" ? body.defaultBranch.trim() : undefined;

  if (!owner || !repo || !history) {
    return Response.json({ ok: false, error: "Missing repo or history." }, { status: 400 });
  }

  let githubAuth = null;
  try {
    const repoId = parseRepoInput(`${owner}/${repo}`);
    githubAuth = await githubAuthForRequest(repoId, request);
  } catch {
    githubAuth = null;
  }

  // Public-only beta: refuse before cache/Gateway see private graph facts.
  const visibility = await assertPublicRepoForAgent({ owner, repo, auth: githubAuth });
  if (!visibility.ok) {
    return Response.json(
      { ok: false, error: visibility.error, starters: [], source: "fallback" },
      { status: 403 },
    );
  }

  const result = await generateAgentStarters({
    workosUserId: user.id,
    userEmail: user.email,
    owner,
    repo,
    history,
    defaultBranch: defaultBranch || undefined,
    repoIsPublic: true,
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
