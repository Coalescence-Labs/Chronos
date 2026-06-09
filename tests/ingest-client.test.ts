import { describe, expect, test } from "bun:test";
import type { CommitsPageResponse, RepoResponse } from "@/lib/ingest/api";
import { IngestError } from "@/lib/ingest/errors";
import { fetchPublicRepoHistory } from "@/lib/ingest/client";
import type { CommitNode } from "@/lib/graph/types";

function node(sha: string, parents: string[] = []): CommitNode {
  return { sha, parents, author: "Ada Lovelace", date: "2026-06-01T12:00:00Z", message: sha };
}

function bffMock(
  initial: RepoResponse,
  pages: Record<number, CommitsPageResponse>,
): { fetchImpl: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const fetchImpl = ((input: RequestInfo | URL) => {
    const url = new URL(input.toString(), "http://localhost");
    calls.push(url.pathname + url.search);
    if (url.pathname === "/api/repo") {
      return Promise.resolve(Response.json(initial));
    }
    const page = pages[Number(url.searchParams.get("page"))];
    return Promise.resolve(
      page
        ? Response.json(page)
        : Response.json(
            { error: { code: "upstream", message: "unexpected page" } },
            { status: 502 },
          ),
    );
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const initial: RepoResponse = {
  repo: { owner: "acme", repo: "widgets", defaultBranch: "main" },
  history: {
    commits: [node("c3", ["c2"]), node("c2", ["c1"])],
    refs: [{ name: "main", type: "branch", sha: "c3" }],
  },
  nextPage: 2,
};

describe("fetchPublicRepoHistory", () => {
  test("assembles pages into one history, deduplicating overlap", async () => {
    const { fetchImpl, calls } = bffMock(initial, {
      2: { commits: [node("c2", ["c1"]), node("c1")], nextPage: null },
    });
    const progress: number[] = [];
    const result = await fetchPublicRepoHistory("acme/widgets", {
      fetchImpl,
      onProgress: (history) => progress.push(history.commits.length),
    });

    expect(result.truncated).toBe(false);
    expect(result.history.commits.map((commit) => commit.sha)).toEqual(["c3", "c2", "c1"]);
    expect(result.history.refs).toEqual([{ name: "main", type: "branch", sha: "c3" }]);
    expect(progress).toEqual([2, 3]);
    expect(calls).toEqual([
      "/api/repo?repo=acme%2Fwidgets",
      "/api/repo/commits?repo=acme%2Fwidgets&sha=main&page=2",
    ]);
  });

  test("stops at maxPages and reports truncation", async () => {
    const { fetchImpl, calls } = bffMock(initial, {
      2: { commits: [node("c1")], nextPage: 3 },
    });
    const result = await fetchPublicRepoHistory("acme/widgets", { fetchImpl, maxPages: 2 });
    expect(result.truncated).toBe(true);
    expect(result.history.commits).toHaveLength(3);
    expect(calls).toHaveLength(2);
  });

  test("rethrows BFF errors as IngestError with the wire code", async () => {
    const fetchImpl = (() =>
      Promise.resolve(
        Response.json(
          { error: { code: "rate-limited", message: "Try later.", retryAfterSeconds: 60 } },
          { status: 429 },
        ),
      )) as unknown as typeof fetch;

    await expect(fetchPublicRepoHistory("acme/widgets", { fetchImpl })).rejects.toMatchObject({
      name: "IngestError",
      code: "rate-limited",
      retryAfterSeconds: 60,
    });
    await fetchPublicRepoHistory("acme/widgets", { fetchImpl }).catch((error) => {
      expect(error).toBeInstanceOf(IngestError);
    });
  });
});
