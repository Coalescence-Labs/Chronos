"use client";

import { useEffect, useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui";
import type { RepoHistory } from "@/lib/graph";
import { fetchPublicRepoHistory, IngestError } from "@/lib/ingest";
import { GraphExplorer } from "./GraphExplorer";

/**
 * The live end-to-end view (COA-71): progressive ingestion → GraphExplorer.
 * Pages stream in via onProgress so the first 100 commits render before the
 * rest arrive. Loading/error/empty here; graph + inspection in GraphExplorer.
 */

/** Fetch progress/outcome, tagged with the request it answers so stale
 * results from a previous repo or retry are ignored instead of reset. */
interface LoadedState {
  key: string;
  history: RepoHistory;
  truncated: boolean;
  complete: boolean;
}

interface FailedState {
  key: string;
  error: Error;
}

export interface RepoScreenProps {
  owner: string;
  repo: string;
}

export function RepoScreen({ owner, repo }: RepoScreenProps) {
  const [loaded, setLoaded] = useState<LoadedState | null>(null);
  const [failed, setFailed] = useState<FailedState | null>(null);
  const [attempt, setAttempt] = useState(0);

  const requestKey = `${owner}/${repo}#${attempt}`;

  useEffect(() => {
    let cancelled = false;
    // onProgress hands back the same mutating object each page — clone so
    // React sees a new reference and re-renders.
    const snapshot = (h: RepoHistory): RepoHistory => ({ commits: [...h.commits], refs: h.refs });

    fetchPublicRepoHistory(`${owner}/${repo}`, {
      onProgress: (h) => {
        if (!cancelled) {
          setLoaded({ key: requestKey, history: snapshot(h), truncated: false, complete: false });
        }
      },
    })
      .then((result) => {
        if (!cancelled) {
          setLoaded({
            key: requestKey,
            history: snapshot(result.history),
            truncated: result.truncated,
            complete: true,
          });
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setFailed({
            key: requestKey,
            error:
              cause instanceof Error
                ? cause
                : new IngestError("upstream", "Something went wrong."),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [owner, repo, requestKey]);

  const history = loaded?.key === requestKey ? loaded.history : null;
  const error = failed?.key === requestKey ? failed.error : null;

  if (error) {
    return (
      <ErrorState
        title="Couldn't load that repository"
        message={error.message}
        onRetry={() => setAttempt((n) => n + 1)}
      />
    );
  }
  if (!history) {
    return <LoadingState label={`Reading ${owner}/${repo}…`} />;
  }
  if (history.commits.length === 0) {
    return (
      <EmptyState
        title="No commits yet"
        hint="This repository exists but has no history to draw."
      />
    );
  }

  return (
    <GraphExplorer
      history={history}
      owner={owner}
      repo={repo}
      status={
        <>
          {history.commits.length.toLocaleString()} commits
          {!loaded?.complete && " · loading more…"}
          {loaded?.complete &&
            loaded.truncated &&
            " · showing the most recent pages of a longer history"}
        </>
      }
    />
  );
}
