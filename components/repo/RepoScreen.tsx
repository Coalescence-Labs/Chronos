"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui";
import type { RepoHistory } from "@/lib/graph";
import { fetchPublicRepoHistory, IngestError } from "@/lib/ingest";
import type { IngestResult } from "@/lib/ingest";
import { GraphExplorer } from "./GraphExplorer";

/**
 * The live end-to-end view (COA-71): progressive ingestion → GraphExplorer.
 * Pages stream in via onProgress so the first 100 commits render before the
 * rest arrive; deeper trunk pages load lazily as the user scrolls toward the
 * oldest loaded rows, so the GitHub budget is only spent on history that is
 * actually viewed. Loading/error/empty here; graph + inspection in
 * GraphExplorer.
 */

/** Fetch progress/outcome, tagged with the request it answers so stale
 * results from a previous repo or retry are ignored instead of reset. */
interface LoadedState {
  key: string;
  history: RepoHistory;
  truncated: boolean;
  /** More pages remain within the cap — scrolling will load them. */
  hasMore: boolean;
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

// onProgress and loadMore hand back the same mutating object — clone so
// React sees a new reference and re-renders.
const snapshot = (h: RepoHistory): RepoHistory => ({ commits: [...h.commits], refs: h.refs });

export function RepoScreen({ owner, repo }: RepoScreenProps) {
  const [loaded, setLoaded] = useState<LoadedState | null>(null);
  const [failed, setFailed] = useState<FailedState | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  // The lazy-paging continuation for the *current* request; null while a
  // page fetch is in flight so onNearEnd (fired per render) can't double-load.
  const loadMoreRef = useRef<IngestResult["loadMore"] | null>(null);

  const requestKey = `${owner}/${repo}#${attempt}`;
  const requestKeyRef = useRef(requestKey);

  useEffect(() => {
    let cancelled = false;
    requestKeyRef.current = requestKey;
    loadMoreRef.current = null;

    fetchPublicRepoHistory(`${owner}/${repo}`, {
      onProgress: (h) => {
        if (!cancelled) {
          setLoaded({
            key: requestKey,
            history: snapshot(h),
            truncated: false,
            hasMore: false,
            complete: false,
          });
        }
      },
    })
      .then((result) => {
        if (cancelled) return;
        loadMoreRef.current = result.loadMore ?? null;
        setLoaded({
          key: requestKey,
          history: snapshot(result.history),
          truncated: result.truncated,
          hasMore: result.loadMore !== undefined,
          complete: true,
        });
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
      loadMoreRef.current = null;
    };
  }, [owner, repo, requestKey]);

  const handleNearEnd = useCallback(() => {
    const loadMore = loadMoreRef.current;
    if (!loadMore) return;
    loadMoreRef.current = null;
    setLoadingMore(true);
    loadMore()
      .then((result) => {
        if (requestKeyRef.current !== requestKey) return; // navigated away
        loadMoreRef.current = result.loadMore ?? null;
        setLoaded({
          key: requestKey,
          history: snapshot(result.history),
          truncated: result.truncated,
          hasMore: result.loadMore !== undefined,
          complete: true,
        });
      })
      .catch(() => {
        // Transient (e.g. rate limit): re-arm so the next scroll retries.
        if (requestKeyRef.current === requestKey) loadMoreRef.current = loadMore;
      })
      .finally(() => setLoadingMore(false));
  }, [requestKey]);

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
      onNearEnd={handleNearEnd}
      status={
        <>
          {history.commits.length.toLocaleString()} commits
          {!loaded?.complete && " · loading…"}
          {loaded?.complete &&
            loaded.hasMore &&
            (loadingMore && " · loading older commits…")}
          {loaded?.complete &&
            !loaded.hasMore &&
            loaded.truncated &&
            " · showing the most recent pages of a longer history"}
        </>
      }
    />
  );
}
