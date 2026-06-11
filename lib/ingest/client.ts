import type { RepoHistory } from "@/lib/graph/types";
import type { CommitsPageResponse, IngestErrorBody, RepoResponse } from "./api";
import { IngestError } from "./errors";

/**
 * Browser-side ingestion adapter: talks to the BFF routes and assembles the
 * normalized model progressively — first page renders fast, the rest
 * backfills page by page (decision #3's progressive-loading posture).
 */

export interface IngestResult {
  history: RepoHistory;
  /** True while older history exists upstream that isn't loaded yet. */
  truncated: boolean;
  /**
   * Lazy paging: fetches one more trunk page (100 commits) into the same
   * history and resolves with the updated result. Absent once everything is
   * loaded or the maxPages cap is reached — so the GitHub budget is only
   * spent on history the user actually scrolls toward.
   */
  loadMore?: () => Promise<IngestResult>;
}

export interface IngestOptions {
  /** Hard cap on default-branch commit pages (100 commits each). */
  maxPages?: number;
  /** Pages loaded eagerly before returning; the rest go through loadMore. */
  initialPages?: number;
  /**
   * Cap on side branches loaded beyond the default branch (one page each),
   * so every branch ref can appear in the graph, not just the trunk.
   */
  maxBranchTips?: number;
  /** Called after each page so the UI can render incrementally. */
  onProgress?: (history: RepoHistory) => void;
  fetchImpl?: typeof fetch;
}

export const DEFAULT_MAX_PAGES = 10;
export const DEFAULT_INITIAL_PAGES = 3;
export const DEFAULT_MAX_BRANCH_TIPS = 10;

async function getJson<T>(fetchImpl: typeof fetch, url: string): Promise<T> {
  const response = await fetchImpl(url);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as IngestErrorBody | null;
    throw body
      ? new IngestError(body.error.code, body.error.message, body.error.retryAfterSeconds)
      : new IngestError("upstream", "Something went wrong fetching the repository.");
  }
  return response.json() as Promise<T>;
}

export async function fetchPublicRepoHistory(
  input: string,
  options: IngestOptions = {},
): Promise<IngestResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const repoParam = encodeURIComponent(input);

  const initial = await getJson<RepoResponse>(fetchImpl, `/api/repo?repo=${repoParam}`);
  const bySha = new Map(initial.history.commits.map((commit) => [commit.sha, commit]));
  const history: RepoHistory = {
    commits: [...initial.history.commits],
    refs: initial.history.refs,
  };
  options.onProgress?.(history);

  const merge = (commits: RepoHistory["commits"]): number => {
    let added = 0;
    for (const commit of commits) {
      if (!bySha.has(commit.sha)) {
        bySha.set(commit.sha, commit);
        history.commits.push(commit);
        added++;
      }
    }
    return added;
  };

  let nextPage = initial.nextPage;
  const branch = encodeURIComponent(initial.repo.defaultBranch);

  const fetchTrunkPage = async (page: number): Promise<number | null> => {
    const data = await getJson<CommitsPageResponse>(
      fetchImpl,
      `/api/repo/commits?repo=${repoParam}&sha=${branch}&page=${page}`,
    );
    merge(data.commits);
    options.onProgress?.(history);
    return data.nextPage;
  };

  const initialPages = Math.min(options.initialPages ?? DEFAULT_INITIAL_PAGES, maxPages);
  while (nextPage !== null && nextPage <= initialPages) {
    nextPage = await fetchTrunkPage(nextPage);
  }

  // Side branches: the trunk pages only cover default-branch history, so
  // branch tips that haven't merged yet would never load — and a ref without
  // its commit can't appear in the graph. Load one page per missing tip;
  // deeper parents render as open edges until merged history picks them up.
  const missingTips = history.refs
    .filter((ref) => ref.type === "branch" && !bySha.has(ref.sha))
    .slice(0, options.maxBranchTips ?? DEFAULT_MAX_BRANCH_TIPS);
  for (const ref of missingTips) {
    const page = await getJson<CommitsPageResponse>(
      fetchImpl,
      `/api/repo/commits?repo=${repoParam}&sha=${encodeURIComponent(ref.name)}&page=1`,
    );
    if (merge(page.commits) > 0) options.onProgress?.(history);
  }

  async function loadMore(): Promise<IngestResult> {
    if (nextPage !== null && nextPage <= maxPages) {
      nextPage = await fetchTrunkPage(nextPage);
    }
    return makeResult();
  }

  function makeResult(): IngestResult {
    return {
      history,
      truncated: nextPage !== null,
      loadMore: nextPage !== null && nextPage <= maxPages ? loadMore : undefined,
    };
  }

  return makeResult();
}
