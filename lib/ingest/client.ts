import { pruneUnreachable } from "@/lib/graph/reachability";
import type { CommitNode, RepoHistory } from "@/lib/graph/types";
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
  const history: RepoHistory = {
    commits: [...initial.history.commits],
    refs: initial.history.refs,
  };
  options.onProgress?.(history);

  const merge = (commits: RepoHistory["commits"]): number => {
    // The dedupe set is rebuilt per call: a refresh (COA-127) may prune or
    // add commits in this shared history object between pages, so a
    // long-lived map would go stale and corrupt later merges.
    const known = new Set(history.commits.map((commit) => commit.sha));
    let added = 0;
    for (const commit of commits) {
      if (!known.has(commit.sha)) {
        known.add(commit.sha);
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
  const loadedShas = new Set(history.commits.map((commit) => commit.sha));
  const missingTips = history.refs
    .filter((ref) => ref.type === "branch" && !loadedShas.has(ref.sha))
    .slice(0, options.maxBranchTips ?? DEFAULT_MAX_BRANCH_TIPS);
  for (const ref of missingTips) {
    const page = await getJson<CommitsPageResponse>(
      fetchImpl,
      `/api/repo/commits?repo=${repoParam}&sha=${encodeURIComponent(ref.name)}&page=1`,
    );
    if (merge(page.commits) > 0) options.onProgress?.(history);
  }

  async function loadMore(): Promise<IngestResult> {
    // Pages are numbered from the *current* tip: a refresh that advanced the
    // branch shifts older history to higher page numbers, so a page can come
    // back fully deduplicated. Skip ahead until new commits land (or the
    // cap/end), so every call makes visible progress.
    while (nextPage !== null && nextPage <= maxPages) {
      const before = history.commits.length;
      nextPage = await fetchTrunkPage(nextPage);
      if (history.commits.length > before) break;
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

export interface RefreshResult {
  history: RepoHistory;
  /** True if any ref moved, appeared, or disappeared since `existing`. */
  changed: boolean;
  /** New commits that survived reconciliation. */
  added: number;
  /** Loaded commits dropped because no current ref reaches them. */
  pruned: number;
}

export interface RefreshOptions {
  /** Cap on trunk pages fetched to reconnect an advanced default branch. */
  maxPages?: number;
  /** Cap on moved-tip pages fetched to reconcile advanced branches. */
  maxBranchTips?: number;
  /** Called once the reconciled history is ready, for in-place re-render. */
  onProgress?: (history: RepoHistory) => void;
  fetchImpl?: typeof fetch;
}

/**
 * Re-sync a loaded history with upstream (COA-100, reconciled per COA-127).
 * The result is equivalent to a fresh load of the current upstream state —
 * additions *and* removals — while updating `existing` in place so the
 * viewport, selection, trace, and the lazy-paging continuation all survive.
 *
 * Mechanics:
 * 1. One `/api/repo` request. If no ref moved, nothing upstream changed —
 *    return immediately (the COA-100 single-request happy-path guarantee).
 * 2. Gap-fill: keep fetching trunk pages while the newly fetched history
 *    still has parents that are neither loaded nor fetched — i.e. until the
 *    new commits connect to the loaded graph (a large advance can outrun
 *    page 1). Capped by maxPages; if the gap can't be closed, reconciliation
 *    degrades to fresh-load semantics (disconnected old rows are pruned).
 * 3. Back-fill branch tips that still lack a loaded commit, one page each,
 *    exactly like the initial ingest (capped by maxBranchTips).
 * 4. Reconcile: swap in the fresh refs, prune commits no current ref
 *    reaches (deleted branches, rebases, force-pushes, squash-merges), and
 *    restore newest-first order.
 * 5. Apply atomically to `existing` — a mid-flight error leaves the loaded
 *    graph untouched (no data loss).
 */
export async function refreshRepoHistory(
  input: string,
  existing: RepoHistory,
  options: RefreshOptions = {},
): Promise<RefreshResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const repoParam = encodeURIComponent(input);

  const initial = await getJson<RepoResponse>(fetchImpl, `/api/repo?repo=${repoParam}`);
  const freshRefs = initial.history.refs;

  // Happy path: identical refs mean the upstream reachable state is
  // identical too — page 1 from an unmoved tip holds nothing new. One
  // request, no churn, the loaded object untouched.
  if (!refsChanged(existing.refs, freshRefs)) {
    return { history: existing, changed: false, added: 0, pruned: 0 };
  }

  const known = new Set(existing.commits.map((commit) => commit.sha));
  const fetched: CommitNode[] = [];
  const fetchedShas = new Set<string>();
  const record = (commits: readonly CommitNode[]) => {
    for (const commit of commits) {
      if (!known.has(commit.sha) && !fetchedShas.has(commit.sha)) {
        fetchedShas.add(commit.sha);
        fetched.push(commit);
      }
    }
  };

  record(initial.history.commits);

  // The newly fetched history is connected once every parent it references
  // is either already loaded or itself fetched. Until then, still-reachable
  // loaded rows below the gap would be indistinguishable from orphans and
  // pruning would eat them — so keep paging the trunk toward the gap.
  const dangling = () =>
    fetched.some((commit) =>
      commit.parents.some((parent) => !known.has(parent) && !fetchedShas.has(parent)),
    );

  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const branch = encodeURIComponent(initial.repo.defaultBranch);
  let nextPage = initial.nextPage;
  while (nextPage !== null && nextPage <= maxPages && dangling()) {
    const page = await getJson<CommitsPageResponse>(
      fetchImpl,
      `/api/repo/commits?repo=${repoParam}&sha=${branch}&page=${nextPage}`,
    );
    record(page.commits);
    nextPage = page.nextPage;
  }

  // A tip that moved beyond the fetched pages is a ref with no loaded
  // commit — fetch one page each so it anchors to a real node, mirroring
  // the initial ingest posture (deeper parents render as open edges).
  const missingTips = freshRefs
    .filter(
      (ref) => ref.type === "branch" && !known.has(ref.sha) && !fetchedShas.has(ref.sha),
    )
    .slice(0, options.maxBranchTips ?? DEFAULT_MAX_BRANCH_TIPS);
  for (const ref of missingTips) {
    const page = await getJson<CommitsPageResponse>(
      fetchImpl,
      `/api/repo/commits?repo=${repoParam}&sha=${encodeURIComponent(ref.name)}&page=1`,
    );
    record(page.commits);
  }

  // Reconcile: fresh refs decide reachability; whatever they can't reach is
  // gone upstream (or never existed there) and goes here too.
  const { history: reconciled, pruned } = pruneUnreachable({
    commits: [...existing.commits, ...fetched],
    refs: freshRefs,
  });

  // Restore the model contract's newest-first order (stable, so equal
  // timestamps keep their relative page order); layout tie-breaks by it.
  const time = (commit: CommitNode): number => {
    const parsed = Date.parse(commit.date);
    return Number.isNaN(parsed) ? 0 : parsed;
  };
  const commits = [...reconciled.commits].sort((a, b) => time(b) - time(a));

  const survivors = new Set(commits.map((commit) => commit.sha));
  const added = fetched.filter((commit) => survivors.has(commit.sha)).length;

  // Apply atomically to the live object: the lazy-paging continuation from
  // fetchPublicRepoHistory closes over it, so mutating in place keeps the
  // cursor and the rendered history coherent.
  existing.commits.length = 0;
  existing.commits.push(...commits);
  existing.refs = freshRefs;

  options.onProgress?.(existing);
  return { history: existing, changed: true, added, pruned };
}

/** Refs differ if the set of (name → sha) bindings isn't identical. */
function refsChanged(before: RepoHistory["refs"], after: RepoHistory["refs"]): boolean {
  if (before.length !== after.length) return true;
  const prior = new Map(before.map((ref) => [ref.name, ref.sha]));
  return after.some((ref) => prior.get(ref.name) !== ref.sha);
}
