import { commitIndex, reachableFrom } from "@/lib/graph";
import type { CommitNode, Ref } from "@/lib/graph";
import type { CommitsPageResponse, RepoResponse } from "@/lib/ingest/api";

/**
 * Upstream git simulator for refresh-correctness scenarios (COA-129).
 *
 * An `Upstream` is the *full* state of a remote repository at a moment in
 * time: every commit plus the branch/tag refs. `upstreamMock` serves it
 * through the BFF wire contract exactly like app/api/repo/* would —
 * `git log <ref>` semantics (reachable set, newest-first), fixed-size pages,
 * and a HEAD ref prepended at the default-branch tip. Scenarios then become
 * plain data: a `before` upstream (initial load) and an `after` upstream
 * (what refresh must reconcile to).
 */

export interface Upstream {
  /** Every commit in the upstream graph, any order. */
  commits: CommitNode[];
  /** Branch/tag refs; HEAD is added automatically at the default tip. */
  refs: Ref[];
  defaultBranch: string;
}

export const branch = (name: string, sha: string): Ref => ({ name, type: "branch", sha });
export const tag = (name: string, sha: string): Ref => ({ name, type: "tag", sha });

export interface UpstreamMockOptions {
  /** Commits per page — small by default so paging/gap-fill is exercised. */
  pageSize?: number;
}

export interface UpstreamMock {
  fetchImpl: typeof fetch;
  /** Every request the client made, pathname + query, in order. */
  calls: string[];
}

export function upstreamMock(
  upstream: Upstream,
  options: UpstreamMockOptions = {},
): UpstreamMock {
  const pageSize = options.pageSize ?? 3;
  const calls: string[] = [];
  const bySha = commitIndex(upstream.commits);

  const resolve = (param: string): string =>
    upstream.refs.find((ref) => ref.name === param)?.sha ?? param;

  const time = (commit: CommitNode): number => {
    const parsed = Date.parse(commit.date);
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  /** `git log <ref>`: reachable commits, newest first (stable on ties). */
  const log = (param: string): CommitNode[] => {
    const reachable = reachableFrom([resolve(param)], bySha);
    return upstream.commits
      .filter((commit) => reachable.has(commit.sha))
      .sort((a, b) => time(b) - time(a));
  };

  const pageOf = (list: CommitNode[], page: number): CommitsPageResponse => ({
    commits: list.slice((page - 1) * pageSize, page * pageSize),
    nextPage: page * pageSize < list.length ? page + 1 : null,
  });

  const fetchImpl = ((input: RequestInfo | URL) => {
    const url = new URL(input.toString(), "http://localhost");
    calls.push(url.pathname + url.search);

    if (url.pathname === "/api/repo") {
      const first = pageOf(log(upstream.defaultBranch), 1);
      const defaultTip = resolve(upstream.defaultBranch);
      const response: RepoResponse = {
        repo: { owner: "acme", repo: "widgets", defaultBranch: upstream.defaultBranch },
        history: {
          commits: first.commits,
          refs: [{ name: "HEAD", type: "head", sha: defaultTip }, ...upstream.refs],
        },
        nextPage: first.nextPage,
      };
      return Promise.resolve(Response.json(response));
    }

    if (url.pathname === "/api/repo/commits") {
      const sha = url.searchParams.get("sha") ?? "";
      const page = Number(url.searchParams.get("page") ?? "1");
      return Promise.resolve(Response.json(pageOf(log(sha), page)));
    }

    return Promise.resolve(
      Response.json({ error: { code: "upstream", message: "unexpected path" } }, { status: 502 }),
    );
  }) as typeof fetch;

  return { fetchImpl, calls };
}
