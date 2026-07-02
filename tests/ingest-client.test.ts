import { describe, expect, test } from "bun:test";
import type { CommitsPageResponse, RepoResponse } from "@/lib/ingest/api";
import { IngestError } from "@/lib/ingest/errors";
import { fetchPublicRepoHistory, refreshRepoHistory } from "@/lib/ingest/client";
import type { CommitNode, RepoHistory } from "@/lib/graph/types";

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

  test("stops at maxPages and reports truncation with no loadMore", async () => {
    const { fetchImpl, calls } = bffMock(initial, {
      2: { commits: [node("c1")], nextPage: 3 },
    });
    const result = await fetchPublicRepoHistory("acme/widgets", { fetchImpl, maxPages: 2 });
    expect(result.truncated).toBe(true);
    expect(result.loadMore).toBeUndefined();
    expect(result.history.commits).toHaveLength(3);
    expect(calls).toHaveLength(2);
  });

  test("loads initialPages eagerly, the rest lazily through loadMore", async () => {
    const { fetchImpl, calls } = bffMock(initial, {
      2: { commits: [node("c1", ["c0"])], nextPage: 3 },
      3: { commits: [node("c0", ["b9"])], nextPage: 4 },
      4: { commits: [node("b9")], nextPage: null },
    });
    const first = await fetchPublicRepoHistory("acme/widgets", { fetchImpl, initialPages: 2 });
    expect(calls).toHaveLength(2); // /api/repo + page 2 only
    expect(first.history.commits.map((c) => c.sha)).toEqual(["c3", "c2", "c1"]);
    expect(first.truncated).toBe(true);
    expect(first.loadMore).toBeDefined();

    const second = await first.loadMore!();
    expect(calls).toHaveLength(3);
    expect(second.history).toBe(first.history); // same assembled history
    expect(second.history.commits.map((c) => c.sha)).toEqual(["c3", "c2", "c1", "c0"]);
    expect(second.loadMore).toBeDefined();

    const third = await second.loadMore!();
    expect(third.history.commits).toHaveLength(5);
    expect(third.truncated).toBe(false);
    expect(third.loadMore).toBeUndefined();
  });

  test("loadMore stops handing out continuations at the maxPages cap", async () => {
    const { fetchImpl } = bffMock(initial, {
      2: { commits: [node("c1")], nextPage: 3 },
      3: { commits: [node("c0")], nextPage: 4 },
    });
    const first = await fetchPublicRepoHistory("acme/widgets", {
      fetchImpl,
      initialPages: 2,
      maxPages: 3,
    });
    const second = await first.loadMore!();
    expect(second.truncated).toBe(true); // page 4 exists upstream…
    expect(second.loadMore).toBeUndefined(); // …but the cap stops here
  });

  test("loadMore reports pages to onProgress like the eager path", async () => {
    const progress: number[] = [];
    const { fetchImpl } = bffMock(initial, {
      2: { commits: [node("c1")], nextPage: null },
    });
    const first = await fetchPublicRepoHistory("acme/widgets", {
      fetchImpl,
      initialPages: 1,
      onProgress: (history) => progress.push(history.commits.length),
    });
    await first.loadMore!();
    expect(progress).toEqual([2, 3]);
  });

  test("loads one page for each branch tip missing from trunk history", async () => {
    const withFeature: RepoResponse = {
      ...initial,
      history: {
        commits: initial.history.commits,
        refs: [
          ...initial.history.refs,
          { name: "feature/x", type: "branch", sha: "f2" }, // tip not in trunk pages
        ],
      },
      nextPage: null,
    };
    const calls: string[] = [];
    const fetchImpl = ((input: RequestInfo | URL) => {
      const url = new URL(input.toString(), "http://localhost");
      calls.push(url.pathname + url.search);
      if (url.pathname === "/api/repo") return Promise.resolve(Response.json(withFeature));
      expect(url.searchParams.get("sha")).toBe("feature/x");
      return Promise.resolve(
        Response.json({
          commits: [node("f2", ["f1"]), node("f1", ["c2"]), node("c2", ["c1"])],
          nextPage: 2,
        } satisfies CommitsPageResponse),
      );
    }) as typeof fetch;

    const result = await fetchPublicRepoHistory("acme/widgets", { fetchImpl });
    expect(calls).toEqual([
      "/api/repo?repo=acme%2Fwidgets",
      "/api/repo/commits?repo=acme%2Fwidgets&sha=feature%2Fx&page=1",
    ]);
    // Tip and its line load once each; the overlapping c2 stays deduplicated.
    expect(result.history.commits.map((commit) => commit.sha)).toEqual(["c3", "c2", "f2", "f1"]);
    expect(result.truncated).toBe(false);
  });

  test("skips branch tips already covered by trunk history", async () => {
    const { fetchImpl, calls } = bffMock(
      { ...initial, nextPage: null }, // main's tip c3 is in the initial page
      {},
    );
    await fetchPublicRepoHistory("acme/widgets", { fetchImpl });
    expect(calls).toEqual(["/api/repo?repo=acme%2Fwidgets"]);
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

describe("refreshRepoHistory", () => {
  // A history as it would sit loaded in the UI: trunk paged deeper than page 1.
  const loaded: RepoHistory = {
    commits: [node("c3", ["c2"]), node("c2", ["c1"]), node("c1", ["c0"]), node("c0")],
    refs: [{ name: "main", type: "branch", sha: "c3" }],
  };

  test("the happy path (nothing moved) costs a single /api/repo request", async () => {
    const { fetchImpl, calls } = bffMock(initial, {}); // initial = main@c3, page 1 = c3,c2
    const result = await refreshRepoHistory("acme/widgets", loaded, { fetchImpl });

    expect(calls).toEqual(["/api/repo?repo=acme%2Fwidgets"]);
    expect(result.changed).toBe(false);
    expect(result.added).toBe(0);
    expect(result.pruned).toBe(0);
    // The loaded object comes back untouched — zero view churn.
    expect(result.history).toBe(loaded);
    expect(result.history.commits.map((c) => c.sha)).toEqual(["c3", "c2", "c1", "c0"]);
    expect(result.history.refs).toEqual(loaded.refs);
  });

  test("a moved tip + new commit lands, refs swap, still one request", async () => {
    const advanced: RepoResponse = {
      ...initial,
      history: {
        commits: [node("c4", ["c3"]), node("c3", ["c2"])],
        refs: [{ name: "main", type: "branch", sha: "c4" }],
      },
      nextPage: 2,
    };
    const { fetchImpl, calls } = bffMock(advanced, {});
    const before = { commits: [...loaded.commits], refs: loaded.refs };
    const result = await refreshRepoHistory("acme/widgets", before, { fetchImpl });

    // The fetched page connects immediately (c3 is loaded) — no gap paging.
    expect(calls).toEqual(["/api/repo?repo=acme%2Fwidgets"]);
    expect(result.changed).toBe(true);
    expect(result.added).toBe(1);
    expect(result.pruned).toBe(0);
    expect(result.history.commits.map((c) => c.sha)).toEqual(["c3", "c2", "c1", "c0", "c4"]);
    expect(result.history.refs).toEqual([{ name: "main", type: "branch", sha: "c4" }]);
    // Applied in place: the loaded object *is* the result.
    expect(result.history).toBe(before);
  });

  test("a deleted branch's stranded commits are pruned to match a fresh load", async () => {
    // Loaded: main@c3 plus an unmerged feature at f2 (f2 ← f1 ← c2).
    const withFeature: RepoHistory = {
      commits: [
        node("c3", ["c2"]),
        node("f2", ["f1"]),
        node("c2", ["c1"]),
        node("f1", ["c2"]),
        node("c1", ["c0"]),
        node("c0"),
      ],
      refs: [
        { name: "main", type: "branch", sha: "c3" },
        { name: "feature/x", type: "branch", sha: "f2" },
      ],
    };
    // Upstream now: feature/x deleted without merging; main unmoved.
    const { fetchImpl, calls } = bffMock(initial, {});
    const result = await refreshRepoHistory("acme/widgets", withFeature, { fetchImpl });

    expect(calls).toEqual(["/api/repo?repo=acme%2Fwidgets"]);
    expect(result.changed).toBe(true);
    expect(result.pruned).toBe(2);
    expect(result.history.commits.map((c) => c.sha)).toEqual(["c3", "c2", "c1", "c0"]);
    expect(result.history.refs).toEqual([{ name: "main", type: "branch", sha: "c3" }]);
  });

  test("gap-fill pages the trunk until the new history connects, then reconciles", async () => {
    // Upstream advanced far: c7←c6 on page 1, c5←c4 on page 2, page 2's c4
    // has parent c3 which is loaded — connected there, page 3 never fetched.
    const far: RepoResponse = {
      ...initial,
      history: {
        commits: [node("c7", ["c6"]), node("c6", ["c5"])],
        refs: [{ name: "main", type: "branch", sha: "c7" }],
      },
      nextPage: 2,
    };
    const { fetchImpl, calls } = bffMock(far, {
      2: { commits: [node("c5", ["c4"]), node("c4", ["c3"])], nextPage: 3 },
      3: { commits: [node("c3", ["c2"]), node("c2", ["c1"])], nextPage: null },
    });
    const before = { commits: [...loaded.commits], refs: loaded.refs };
    const result = await refreshRepoHistory("acme/widgets", before, { fetchImpl });

    expect(calls).toEqual([
      "/api/repo?repo=acme%2Fwidgets",
      "/api/repo/commits?repo=acme%2Fwidgets&sha=main&page=2",
    ]);
    expect(result.added).toBe(4);
    expect(result.pruned).toBe(0);
    expect(result.history.commits.map((c) => c.sha)).toEqual([
      "c3", "c2", "c1", "c0", "c7", "c6", "c5", "c4",
    ]);
  });

  test("a tip advanced beyond the trunk page costs one extra page to anchor it", async () => {
    const withFeature: RepoResponse = {
      ...initial,
      history: {
        commits: [node("c3", ["c2"]), node("c2", ["c1"])],
        refs: [
          { name: "main", type: "branch", sha: "c3" },
          { name: "feature/x", type: "branch", sha: "f2" }, // not in the trunk page
        ],
      },
      nextPage: null,
    };
    const calls: string[] = [];
    const fetchImpl = ((input: RequestInfo | URL) => {
      const url = new URL(input.toString(), "http://localhost");
      calls.push(url.pathname + url.search);
      if (url.pathname === "/api/repo") return Promise.resolve(Response.json(withFeature));
      expect(url.searchParams.get("sha")).toBe("feature/x");
      return Promise.resolve(
        Response.json({
          commits: [node("f2", ["f1"]), node("f1", ["c3"])],
          nextPage: 2,
        } satisfies CommitsPageResponse),
      );
    }) as typeof fetch;

    const before = { commits: [...loaded.commits], refs: loaded.refs };
    const result = await refreshRepoHistory("acme/widgets", before, { fetchImpl });
    expect(calls).toEqual([
      "/api/repo?repo=acme%2Fwidgets",
      "/api/repo/commits?repo=acme%2Fwidgets&sha=feature%2Fx&page=1",
    ]);
    expect(result.changed).toBe(true);
    expect(result.history.commits.map((c) => c.sha)).toEqual(["c3", "c2", "c1", "c0", "f2", "f1"]);
  });

  test("onProgress fires once on change, never on the happy path", async () => {
    const progress: number[] = [];
    const { fetchImpl } = bffMock(initial, {});
    await refreshRepoHistory("acme/widgets", loaded, {
      fetchImpl,
      onProgress: (h) => progress.push(h.commits.length),
    });
    expect(progress).toEqual([]); // unchanged → no re-render needed

    const advanced: RepoResponse = {
      ...initial,
      history: {
        commits: [node("c4", ["c3"]), node("c3", ["c2"])],
        refs: [{ name: "main", type: "branch", sha: "c4" }],
      },
      nextPage: null,
    };
    const { fetchImpl: fetchAdvanced } = bffMock(advanced, {});
    const before = { commits: [...loaded.commits], refs: loaded.refs };
    await refreshRepoHistory("acme/widgets", before, {
      fetchImpl: fetchAdvanced,
      onProgress: (h) => progress.push(h.commits.length),
    });
    expect(progress).toEqual([5]);
  });

  test("rethrows BFF errors as IngestError", async () => {
    const fetchImpl = (() =>
      Promise.resolve(
        Response.json(
          { error: { code: "rate-limited", message: "Try later." } },
          { status: 429 },
        ),
      )) as unknown as typeof fetch;
    await expect(refreshRepoHistory("acme/widgets", loaded, { fetchImpl })).rejects.toMatchObject({
      name: "IngestError",
      code: "rate-limited",
    });
  });
});
