import type { CommitNode, Ref } from "@/lib/graph/types";
import { IngestError } from "../errors";
import { toBranchRefs, toCommitNode, toTagRefs } from "./map";
import type { GitHubCommitItem, GitHubRefItem } from "./map";
import type { RepoId } from "./parse";

/**
 * Server-side GitHub REST fetchers — the upstream half of the BFF proxy
 * (decisions #3 + #7, docs/PRIVACY.md "Ingestion"). Binding posture:
 *
 * - Unauthenticated, public repos only. No token exists in this path.
 * - Repo data is held in memory for the lifetime of the request and
 *   forwarded already stripped to the normalized model. Nothing is
 *   persisted and nothing here logs response content.
 * - One GitHub call per commit page, client-driven — large histories never
 *   block a single request (rate-limit/caching strategy beyond this is
 *   open decision #6 / COA-74).
 */

const API_BASE = "https://api.github.com";

export const COMMITS_PER_PAGE = 100;
/** Hard cap: 20k commits. Beyond this we refuse politely rather than crawl. */
export const MAX_COMMIT_PAGE = 200;
/** One page each of branches and tags; enough for v1's 60 req/hr budget. */
const REFS_PER_PAGE = 100;

const GITHUB_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "chronos-branch-graph",
};

function toError(response: Response): IngestError {
  if (response.status === 404 || response.status === 451) {
    return new IngestError(
      "not-found",
      "Repository not found. It may be private or misspelled — private repos aren't supported yet.",
    );
  }
  const remaining = response.headers.get("x-ratelimit-remaining");
  if (response.status === 429 || (response.status === 403 && remaining === "0")) {
    const reset = Number(response.headers.get("x-ratelimit-reset"));
    const retryAfterSeconds = Number.isFinite(reset)
      ? Math.max(0, reset - Math.floor(Date.now() / 1000))
      : undefined;
    return new IngestError(
      "rate-limited",
      "GitHub's rate limit was reached. Please try again in a few minutes.",
      retryAfterSeconds,
    );
  }
  return new IngestError(
    "upstream",
    `GitHub returned an unexpected response (${response.status}).`,
  );
}

async function githubGet(
  path: string,
  params: Record<string, string>,
): Promise<Response> {
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url, { headers: GITHUB_HEADERS, cache: "no-store" });
  if (!response.ok) throw toError(response);
  return response;
}

export interface RepoMeta {
  defaultBranch: string;
}

export async function fetchRepoMeta({ owner, repo }: RepoId): Promise<RepoMeta> {
  const response = await githubGet(`/repos/${owner}/${repo}`, {});
  const body = (await response.json()) as { default_branch?: string };
  return { defaultBranch: body.default_branch ?? "main" };
}

export async function fetchRefs(id: RepoId): Promise<Ref[]> {
  const { owner, repo } = id;
  const perPage = { per_page: String(REFS_PER_PAGE) };
  const [branches, tags] = await Promise.all([
    githubGet(`/repos/${owner}/${repo}/branches`, perPage).then(
      (response) => response.json() as Promise<GitHubRefItem[]>,
    ),
    githubGet(`/repos/${owner}/${repo}/tags`, perPage).then(
      (response) => response.json() as Promise<GitHubRefItem[]>,
    ),
  ]);
  return [...toBranchRefs(branches), ...toTagRefs(tags)];
}

export interface CommitPage {
  commits: CommitNode[];
  hasMore: boolean;
}

export async function fetchCommitPage(
  id: RepoId,
  sha: string,
  page: number,
): Promise<CommitPage> {
  if (!Number.isInteger(page) || page < 1) {
    throw new IngestError("invalid-input", "Page must be a positive integer.");
  }
  if (page > MAX_COMMIT_PAGE) {
    throw new IngestError(
      "too-large",
      `This history is very large; Chronos currently shows the most recent ${
        MAX_COMMIT_PAGE * COMMITS_PER_PAGE
      } commits per branch.`,
    );
  }

  const { owner, repo } = id;
  const url = new URL(`${API_BASE}/repos/${owner}/${repo}/commits`);
  url.searchParams.set("sha", sha);
  url.searchParams.set("per_page", String(COMMITS_PER_PAGE));
  url.searchParams.set("page", String(page));
  const response = await fetch(url, { headers: GITHUB_HEADERS, cache: "no-store" });

  // 409 = empty repository: a valid history with zero commits, not an error.
  if (response.status === 409) return { commits: [], hasMore: false };
  if (!response.ok) throw toError(response);

  const items = (await response.json()) as GitHubCommitItem[];
  const link = response.headers.get("link") ?? "";
  return {
    commits: items.map(toCommitNode),
    hasMore: /rel="next"/.test(link),
  };
}
