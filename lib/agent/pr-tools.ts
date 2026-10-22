import type { GitHubRequestAuth } from "@/lib/ingest/github/fetch";

export interface PullRequestFact {
  number: number;
  title: string;
  labels: string[];
}

const PR_QUESTION = /\b(pull request|pull requests|\bpr\b|#\d{1,5})\b/i;

export function questionRequestsPullRequestFacts(question: string): boolean {
  return PR_QUESTION.test(question);
}

/** Titles and labels only — no bodies, no authors. Requires verified repo auth. */
export async function fetchPullRequestFacts(
  owner: string,
  repo: string,
  auth: GitHubRequestAuth,
): Promise<PullRequestFact[]> {
  if (!auth.accessToken) return [];
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=10`;
  const response = await fetch(url, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${auth.accessToken}`,
      "x-github-api-version": "2022-11-28",
    },
    signal: auth.signal ?? AbortSignal.timeout(12_000),
  });
  if (!response.ok) return [];
  const rows = (await response.json()) as Array<{
    number: number;
    title: string;
    labels?: Array<{ name?: string }>;
  }>;
  return rows.map((row) => ({
    number: row.number,
    title: row.title,
    labels: (row.labels ?? []).map((label) => label.name).filter((name): name is string => Boolean(name)),
  }));
}
