"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui";
import { msBucket, track } from "@/lib/analytics";
import type { RepoHistory } from "@/lib/graph";
import { fetchPublicRepoHistory, IngestError, refreshRepoHistory } from "@/lib/ingest";
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
  const [refreshing, setRefreshing] = useState(false);
  // A note after a manual refresh ("up to date" / "updated"), tagged with the
  // request it belongs to so it clears itself when the repo/attempt changes.
  const [refreshNote, setRefreshNote] = useState<{ key: string; note: string } | null>(null);
  // The lazy-paging continuation for the *current* request; null while a
  // page fetch is in flight so onNearEnd (fired per render) can't double-load.
  const loadMoreRef = useRef<IngestResult["loadMore"] | null>(null);
  // Latest live history, so refresh can re-sync tips without depending on
  // `loaded` (which would re-create the callback every render).
  const historyRef = useRef<RepoHistory | null>(null);
  // How many lazy pages this request has pulled — reported with lazy_page.
  const pagesLoadedRef = useRef(0);
  // Time-to-first-graph (COA-98): when this request started, and whether we've
  // already reported its first paint (the first page with commits to draw).
  const startedAtRef = useRef(0);
  const firstPaintRef = useRef(false);

  const requestKey = `${owner}/${repo}#${attempt}`;
  const requestKeyRef = useRef(requestKey);

  useEffect(() => {
    let cancelled = false;
    requestKeyRef.current = requestKey;
    loadMoreRef.current = null;
    historyRef.current = null;
    pagesLoadedRef.current = 0;
    firstPaintRef.current = false;
    startedAtRef.current = performance.now();

    fetchPublicRepoHistory(`${owner}/${repo}`, {
      onProgress: (h) => {
        if (!cancelled) {
          historyRef.current = h;
          setLoaded({
            key: requestKey,
            history: snapshot(h),
            truncated: false,
            hasMore: false,
            complete: false,
          });
          // Time-to-first-graph: the first page with commits is the first
          // useful paint. Bucketed by device, never the repo or exact ms.
          if (!firstPaintRef.current && h.commits.length > 0) {
            firstPaintRef.current = true;
            const device = window.innerWidth < 700 ? "phone" : "laptop";
            track({
              name: "graph_ready",
              props: { device, ms_bucket: msBucket(performance.now() - startedAtRef.current) },
            });
          }
        }
      },
    })
      .then((result) => {
        if (cancelled) return;
        loadMoreRef.current = result.loadMore ?? null;
        historyRef.current = result.history;
        setLoaded({
          key: requestKey,
          history: snapshot(result.history),
          truncated: result.truncated,
          hasMore: result.loadMore !== undefined,
          complete: true,
        });
        track({ name: "render_result", props: { ok: true } });
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          const error =
            cause instanceof Error
              ? cause
              : new IngestError("upstream", "Something went wrong.");
          setFailed({ key: requestKey, error });
          // Failure rate by *code* (never the repo); rate limits get their own
          // counter so we can size the COA-74 caching/app-token decision.
          const code = error instanceof IngestError ? error.code : "upstream";
          track({ name: "render_result", props: { ok: false, error: code } });
          if (code === "rate-limited") track({ name: "rate_limited" });
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
        historyRef.current = result.history;
        setLoaded({
          key: requestKey,
          history: snapshot(result.history),
          truncated: result.truncated,
          hasMore: result.loadMore !== undefined,
          complete: true,
        });
        pagesLoadedRef.current += 1;
        track({ name: "lazy_page", props: { depth: pagesLoadedRef.current } });
      })
      .catch(() => {
        // Transient (e.g. rate limit): re-arm so the next scroll retries.
        if (requestKeyRef.current === requestKey) loadMoreRef.current = loadMore;
      })
      .finally(() => setLoadingMore(false));
  }, [requestKey]);

  // Manual re-sync of branch tips (COA-100). Updates the loaded history in
  // place — same components, so the viewport's scroll position and any active
  // trace/selection (GraphExplorer state) survive. Lazy paging is untouched:
  // the loadMore cursor still walks older history from where it left off.
  const handleRefresh = useCallback(() => {
    const base = historyRef.current;
    if (!base || refreshing) return;
    setRefreshing(true);
    setRefreshNote(null);
    refreshRepoHistory(`${owner}/${repo}`, base)
      .then((result) => {
        if (requestKeyRef.current !== requestKey) return; // navigated away
        historyRef.current = result.history;
        setLoaded((prev) =>
          prev && prev.key === requestKey
            ? { ...prev, history: snapshot(result.history) }
            : prev,
        );
        setRefreshNote({ key: requestKey, note: result.changed ? "updated just now" : "up to date" });
      })
      .catch(() => {
        if (requestKeyRef.current === requestKey)
          setRefreshNote({ key: requestKey, note: "couldn't refresh" });
      })
      .finally(() => {
        if (requestKeyRef.current === requestKey) setRefreshing(false);
      });
  }, [owner, repo, requestKey, refreshing]);

  const history = loaded?.key === requestKey ? loaded.history : null;
  const error = failed?.key === requestKey ? failed.error : null;
  const note = refreshNote?.key === requestKey ? refreshNote.note : null;

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
      onRefresh={handleRefresh}
      refreshing={refreshing}
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
          {refreshing && " · refreshing…"}
          {!refreshing && note && ` · ${note}`}
        </>
      }
    />
  );
}
