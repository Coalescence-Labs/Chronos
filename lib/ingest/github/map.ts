import type { CommitNode, Ref } from "@/lib/graph/types";

/**
 * Pure mapping from GitHub REST payloads to the normalized model
 * (lib/graph/types). Only the graph-relevant subset of GitHub's response is
 * typed here — anything not in these interfaces is dropped before the data
 * leaves the server (docs/PRIVACY.md: fetch and forward the minimum).
 */

export interface GitHubCommitItem {
  sha: string;
  parents: { sha: string }[];
  commit: {
    author: { name?: string | null; date?: string | null } | null;
    message: string;
  };
  author?: { login: string } | null;
}

export interface GitHubRefItem {
  name: string;
  commit: { sha: string };
}

export function toCommitNode(item: GitHubCommitItem): CommitNode {
  return {
    sha: item.sha,
    parents: item.parents.map((parent) => parent.sha),
    author: item.commit.author?.name ?? item.author?.login ?? "unknown",
    date: item.commit.author?.date ?? "",
    message: item.commit.message.split("\n", 1)[0] ?? "",
  };
}

export function toBranchRefs(branches: GitHubRefItem[]): Ref[] {
  return branches.map((branch) => ({
    name: branch.name,
    type: "branch" as const,
    sha: branch.commit.sha,
  }));
}

export function toTagRefs(tags: GitHubRefItem[]): Ref[] {
  return tags.map((tag) => ({
    name: tag.name,
    type: "tag" as const,
    sha: tag.commit.sha,
  }));
}
