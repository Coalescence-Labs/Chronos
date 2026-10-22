import type { CommitNode, RepoHistory } from "@/lib/graph";
import { reachableFromRefs } from "@/lib/graph";
import type { CommitFact, FactToolContext, GraphFactBundle, RefFact } from "./types";
import { buildLoadHandle } from "./load-handle";

const MAX_FACT_COMMITS = 200;

function toCommitFact(commit: CommitNode): CommitFact {
  return {
    sha: commit.sha,
    parents: [...commit.parents],
    date: commit.date,
    message: commit.message,
    merge: commit.parents.length > 1,
  };
}

function toRefFact(ref: RepoHistory["refs"][number]): RefFact {
  return { name: ref.name, type: ref.type, sha: ref.sha };
}

export function buildGraphFactBundle(context: FactToolContext): GraphFactBundle {
  const reachable = reachableFromRefs(context.history);
  const commits = context.history.commits
    .filter((commit) => reachable.has(commit.sha))
    .slice(0, MAX_FACT_COMMITS)
    .map(toCommitFact);
  return {
    owner: context.owner,
    repo: context.repo,
    loadHandle: buildLoadHandle(context.owner, context.repo, context.history),
    loadedCommits: context.history.commits.length,
    loadedRefs: context.history.refs.length,
    ...(context.selectedSha ? { selectedSha: context.selectedSha } : {}),
    commits,
    refs: context.history.refs.map(toRefFact),
  };
}

export function factBundleForSelectedCommit(
  bundle: GraphFactBundle,
  sha: string,
): GraphFactBundle & { anchor: CommitFact | null } {
  const anchor = bundle.commits.find((commit) => commit.sha === sha) ?? null;
  return { ...bundle, selectedSha: sha, anchor };
}
