import { afterEach, describe, expect, test } from "bun:test";
import { GET as getRepo } from "@/app/api/repo/route";
import { GET as getCommits } from "@/app/api/repo/commits/route";
import type { CommitsPageResponse, IngestErrorBody, RepoResponse } from "@/lib/ingest/api";
import {
  SMALL_REPO,
  githubJson,
  manyCommits,
  mockGitHub,
  nextLinkHeader,
  smallRepoHandler,
} from "./fixtures/github";

let restore: (() => void) | null = null;
afterEach(() => {
  restore?.();
  restore = null;
});

const repoUrl = (repo: string) =>
  new Request(`http://localhost/api/repo?repo=${encodeURIComponent(repo)}`);

describe("GET /api/repo", () => {
  test("returns a populated normalized model for a public repo URL", async () => {
    restore = mockGitHub(smallRepoHandler);
    const response = await getRepo(repoUrl("https://github.com/acme/widgets"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = (await response.json()) as RepoResponse;
    expect(body.repo).toEqual({ owner: "acme", repo: "widgets", defaultBranch: "main" });
    expect(body.nextPage).toBeNull();

    const { commits, refs } = body.history;
    expect(commits).toHaveLength(5);
    expect(commits[0]).toEqual({
      sha: "c5",
      parents: ["c4", "c3"],
      author: "Ada Lovelace",
      date: "2026-06-01T12:00:00Z",
      message: "feat: change for c5",
    });
    expect(refs).toEqual([
      { name: "HEAD", type: "head", sha: "c5" },
      { name: "main", type: "branch", sha: "c5" },
      { name: "feature", type: "branch", sha: "c3" },
      { name: "v1.0.0", type: "tag", sha: "c2" },
    ]);
  });

  test("only requests graph-relevant endpoints — never contents or diffs", async () => {
    const requested: string[] = [];
    restore = mockGitHub((url) => {
      requested.push(url.pathname);
      return smallRepoHandler(url);
    });
    await getRepo(repoUrl("acme/widgets"));
    expect(requested.sort()).toEqual([
      "/repos/acme/widgets",
      "/repos/acme/widgets/branches",
      "/repos/acme/widgets/commits",
      "/repos/acme/widgets/tags",
    ]);
  });

  test("rejects malformed input without calling GitHub", async () => {
    let called = false;
    restore = mockGitHub(() => {
      called = true;
      return githubJson({});
    });
    const response = await getRepo(repoUrl("https://gitlab.com/acme/widgets"));
    expect(response.status).toBe(400);
    const body = (await response.json()) as IngestErrorBody;
    expect(body.error.code).toBe("invalid-input");
    expect(called).toBe(false);
  });

  test("maps 404 (missing or private) to a friendly not-found", async () => {
    restore = mockGitHub(() => githubJson({ message: "Not Found" }, { status: 404 }));
    const response = await getRepo(repoUrl("acme/ghost"));
    expect(response.status).toBe(404);
    const body = (await response.json()) as IngestErrorBody;
    expect(body.error.code).toBe("not-found");
    expect(body.error.message).toContain("private");
  });

  test("maps exhausted rate limits to 429 with Retry-After", async () => {
    const reset = Math.floor(Date.now() / 1000) + 120;
    restore = mockGitHub(() =>
      githubJson(
        { message: "API rate limit exceeded" },
        {
          status: 403,
          headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) },
        },
      ),
    );
    const response = await getRepo(repoUrl("acme/widgets"));
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    const body = (await response.json()) as IngestErrorBody;
    expect(body.error.code).toBe("rate-limited");
    expect(body.error.retryAfterSeconds).toBeGreaterThan(0);
  });

  test("treats an empty repository (409) as zero commits, not an error", async () => {
    restore = mockGitHub((url) => {
      if (url.pathname.endsWith("/commits")) {
        return githubJson({ message: "Git Repository is empty." }, { status: 409 });
      }
      if (url.pathname.endsWith("/branches") || url.pathname.endsWith("/tags")) {
        return githubJson([]);
      }
      return githubJson(SMALL_REPO.meta);
    });
    const response = await getRepo(repoUrl("acme/widgets"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as RepoResponse;
    expect(body.history.commits).toEqual([]);
    expect(body.history.refs).toEqual([]);
    expect(body.nextPage).toBeNull();
  });
});

describe("GET /api/repo/commits", () => {
  const commitsUrl = (params: Record<string, string>) =>
    new Request(`http://localhost/api/repo/commits?${new URLSearchParams(params)}`);

  test("checks public visibility before each history page", async () => {
    const pages = [manyCommits(100, "p1-"), manyCommits(100, "p2-"), manyCommits(50, "p3-")];
    let calls = 0;
    restore = mockGitHub((url) => {
      calls++;
      if (url.pathname === "/repos/acme/widgets") return githubJson({ ...SMALL_REPO.meta, private: false });
      const page = Number(url.searchParams.get("page"));
      expect(url.searchParams.get("per_page")).toBe("100");
      const items = pages[page - 1] ?? [];
      return githubJson(items, page < pages.length ? { headers: nextLinkHeader(page + 1) } : {});
    });

    const first = await getCommits(commitsUrl({ repo: "acme/widgets", sha: "main", page: "1" }));
    const firstBody = (await first.json()) as CommitsPageResponse;
    expect(firstBody.commits).toHaveLength(100);
    expect(firstBody.nextPage).toBe(2);
    expect(calls).toBe(2);

    const last = await getCommits(commitsUrl({ repo: "acme/widgets", sha: "main", page: "3" }));
    const lastBody = (await last.json()) as CommitsPageResponse;
    expect(lastBody.commits).toHaveLength(50);
    expect(lastBody.nextPage).toBeNull();
    expect(calls).toBe(4);
  });

  test("refuses pages beyond the hard cap with a friendly message", async () => {
    restore = mockGitHub(smallRepoHandler);
    const response = await getCommits(
      commitsUrl({ repo: "acme/widgets", sha: "main", page: "201" }),
    );
    expect(response.status).toBe(422);
    const body = (await response.json()) as IngestErrorBody;
    expect(body.error.code).toBe("too-large");
    expect(body.error.message).toContain("20000");
  });

  test("rejects unsafe sha/ref values", async () => {
    restore = mockGitHub(smallRepoHandler);
    for (const sha of ["", "a b", "../../etc", "x".repeat(300)]) {
      const response = await getCommits(commitsUrl({ repo: "acme/widgets", sha, page: "1" }));
      expect(response.status).toBe(400);
    }
  });

  test("rejects invalid page numbers before any authorization or upstream call", async () => {
    let calls = 0;
    restore = mockGitHub(() => { calls++; return githubJson({}); });
    for (const page of ["0", "-1", "NaN", "Infinity", "1.5", "201"]) {
      expect((await getCommits(commitsUrl({ repo: "acme/widgets", sha: "main", page }))).status).toBeGreaterThanOrEqual(400);
    }
    expect(calls).toBe(0);
  });
});

describe("shared credential privacy boundary", () => {
  test("missing visibility metadata fails closed", async () => {
    restore = mockGitHub(() => githubJson({ default_branch: "main" }));
    expect((await getRepo(repoUrl("acme/widgets"))).status).toBe(502);
  });
  test("a pool token with private access cannot expose initial or directly requested history", async () => {
    const previous = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = "ghp_test_private_pool";
    const requested: string[] = [];
    restore = mockGitHub((url) => {
      requested.push(url.pathname);
      if (url.pathname === "/repos/acme/widgets") return githubJson({ ...SMALL_REPO.meta, private: true });
      return smallRepoHandler(url);
    });
    try {
      for (const request of [
        { get: getRepo, url: "http://localhost/api/repo?repo=acme/widgets" },
        { get: getCommits, url: "http://localhost/api/repo/commits?repo=acme/widgets&sha=main&page=1" },
      ]) {
        const response = await request.get(new Request(request.url));
        expect(response.status).toBe(404);
        expect(await response.text()).not.toContain("Ada Lovelace");
      }
      expect(requested).toEqual(["/repos/acme/widgets", "/repos/acme/widgets"]);
    } finally {
      if (previous === undefined) delete process.env.GITHUB_TOKEN;
      else process.env.GITHUB_TOKEN = previous;
    }
  });
});
