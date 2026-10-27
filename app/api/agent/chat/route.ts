import { withAuth } from "@workos-inc/authkit-nextjs";
import type { AgentAnswerUiHint } from "@/lib/agent/answer-format";
import { resolveAgentAnswerUi } from "@/lib/agent/answer-format";
import type { AgentBranchFocus, AgentChatContextRef } from "@/lib/agent/chat-context";
import { agentTurnContextPayload } from "@/lib/agent/chat-context";
import type { RepoHistory } from "@/lib/graph";
import { runAgentTurn } from "@/lib/agent/orchestrate";
import { assertPublicRepoForAgent } from "@/lib/agent/public-repo";
import { enforceDistributedRateLimit } from "@/lib/redis/rate-limit";
import { isRedisConfigured } from "@/lib/redis/config";
import { requestRateLimitIdentity } from "@/lib/security/request";
import { IngestError } from "@/lib/ingest/errors";
import { errorResponse } from "@/lib/ingest/respond";
import { githubAuthForRequest } from "@/lib/ingest/github/auth";
import { parseRepoInput } from "@/lib/ingest/github/parse";

const MAX_COMMITS = 2_500;

function parseFocusedBranch(raw: unknown): AgentBranchFocus | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.name !== "string" || typeof record.tipSha !== "string") return null;
  return { name: record.name, tipSha: record.tipSha };
}

function parseContextRefs(raw: unknown): AgentChatContextRef[] {
  if (!Array.isArray(raw)) return [];
  const refs: AgentChatContextRef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const kind = record.kind;
    if (kind !== "commit" && kind !== "branch") continue;
    if (typeof record.sha !== "string" || typeof record.label !== "string") continue;
    refs.push({
      kind,
      sha: record.sha,
      label: record.label.slice(0, 200),
      ...(typeof record.message === "string" ? { message: record.message.slice(0, 500) } : {}),
    });
  }
  return refs.slice(0, 8);
}

function parseHistory(raw: unknown): RepoHistory | null {
  if (!raw || typeof raw !== "object") return null;
  const history = raw as RepoHistory;
  if (!Array.isArray(history.commits) || !Array.isArray(history.refs)) return null;
  if (history.commits.length > MAX_COMMITS) return null;
  return history;
}

function parseAnswerUi(raw: unknown): AgentAnswerUiHint | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const hint: AgentAnswerUiHint = {};
  if (record.surface === "narrow-panel") hint.surface = "narrow-panel";
  if (record.density === "narrow" || record.density === "comfortable") hint.density = record.density;
  if (typeof record.approxWidthPx === "number") hint.approxWidthPx = record.approxWidthPx;
  return Object.keys(hint).length > 0 ? resolveAgentAnswerUi(hint) : null;
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
    focusedBranch?: unknown;
    contextRefs?: unknown;
    ui?: unknown;
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

  // Public-only beta: verify before any model/cache path sees graph facts.
  const visibility = await assertPublicRepoForAgent({ owner, repo, auth: githubAuth });
  if (!visibility.ok) {
    return Response.json({ ok: false, error: visibility.error }, { status: 403 });
  }

  const { focusedBranch, contextRefs } = agentTurnContextPayload({
    focusedBranch: parseFocusedBranch(body.focusedBranch),
    contextRefs: parseContextRefs(body.contextRefs),
  });

  const result = await runAgentTurn({
    workosUserId: user.id,
    userEmail: user.email,
    owner,
    repo,
    question,
    history,
    selectedSha: body.selectedSha,
    focusedBranch,
    contextRefs,
    ui: parseAnswerUi(body.ui) ?? resolveAgentAnswerUi({ surface: "narrow-panel", density: "narrow" }),
    githubAuth,
    repoIsPublic: true,
  });

  const status = result.ok ? 200 : result.error?.includes("cap") ? 402 : 403;
  return Response.json(result, { status: result.ok ? 200 : status });
}
