import type { GitHubCommitItem, GitHubRefItem } from "@/lib/ingest/github/map";

/**
 * GitHub REST fixtures. Items deliberately carry extra fields beyond the
 * graph-relevant subset (node_id, html_url, stats...) so tests can prove the
 * proxy strips everything the normalized model doesn't need.
 */

type FixtureCommit = GitHubCommitItem & Record<string, unknown>;

export function commitItem(
  sha: string,
  parents: string[],
  overrides: Partial<GitHubCommitItem> = {},
): FixtureCommit {
  return {
    sha,
    parents: parents.map((parent) => ({ sha: parent })),
    commit: {
      author: { name: "Ada Lovelace", date: "2026-06-01T12:00:00Z" },
      message: `feat: change for ${sha}\n\nlonger body that must not leave the server`,
    },
    author: { login: "ada" },
    node_id: `NODE_${sha}`,
    html_url: `https://github.com/acme/widgets/commit/${sha}`,
    comments_url: `https://api.github.com/repos/acme/widgets/commits/${sha}/comments`,
    ...overrides,
  };
}

export function refItem(name: string, sha: string): GitHubRefItem & Record<string, unknown> {
  return { name, commit: { sha }, protected: false };
}

/**
 * Small repo with a merge:
 *
 *   c5 (main, merge of c3 into c4)
 *   ├── c4 ── c2 ── c1 (root)
 *   └── c3 (feature) ── c2
 */
export const SMALL_REPO = {
  meta: { default_branch: "main", full_name: "acme/widgets", size: 123 },
  commits: [
    commitItem("c5", ["c4", "c3"]),
    commitItem("c4", ["c2"]),
    commitItem("c3", ["c2"]),
    commitItem("c2", ["c1"]),
    commitItem("c1", []),
  ],
  branches: [refItem("main", "c5"), refItem("feature", "c3")],
  tags: [refItem("v1.0.0", "c2")],
};

export function manyCommits(count: number, prefix = "sha"): FixtureCommit[] {
  return Array.from({ length: count }, (_, i) =>
    commitItem(`${prefix}${i}`, i === count - 1 ? [] : [`${prefix}${i + 1}`]),
  );
}

export function githubJson(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
}

export function nextLinkHeader(page: number): Record<string, string> {
  return {
    link: `<https://api.github.com/repositories/1/commits?page=${page}>; rel="next", <https://api.github.com/repositories/1/commits?page=999>; rel="last"`,
  };
}

/** Replaces global fetch with a URL-dispatched mock; returns a restore fn. */
export function mockGitHub(handler: (url: URL) => Response | Promise<Response>): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    return Promise.resolve(handler(url));
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

/** Standard handler for SMALL_REPO under acme/widgets. */
export function smallRepoHandler(url: URL): Response {
  switch (url.pathname) {
    case "/repos/acme/widgets":
      return githubJson(SMALL_REPO.meta);
    case "/repos/acme/widgets/branches":
      return githubJson(SMALL_REPO.branches);
    case "/repos/acme/widgets/tags":
      return githubJson(SMALL_REPO.tags);
    case "/repos/acme/widgets/commits":
      return githubJson(SMALL_REPO.commits);
    default:
      return githubJson({ message: "Not Found" }, { status: 404 });
  }
}
