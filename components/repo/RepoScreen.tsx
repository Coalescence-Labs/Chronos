"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { msBucket, track } from "@/lib/analytics";
import type { RepoHistory } from "@/lib/graph";
import {
  fetchPublicRepoHistory,
  formatRetryWait,
  IngestError,
  refreshRepoHistory,
} from "@/lib/ingest";
import type { IngestInterruption, IngestResult } from "@/lib/ingest";
import { GraphExplorer } from "./GraphExplorer";
import styles from "./repo.module.css";

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
  /** GitHub default branch from the BFF — threaded into Glance (COA-211). */
  defaultBranch: string;
  /** GitHub private flag — Agent beta is public-only. */
  private?: boolean;
  truncated: boolean;
  referencesTruncated?: boolean;
  /** More pages remain within the cap — scrolling will load them. */
  hasMore: boolean;
  complete: boolean;
  /** Backfill paused (e.g. rate limit) — the graph stays, a note explains. */
  interrupted?: IngestInterruption;
  /** Signed in with a saved GitHub installation but no usable credential. */
  githubReconnectRequired?: boolean;
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
  const [pagingNote, setPagingNote] = useState<{ key: string; note: string } | null>(null);
  const pagingRetryAt = useRef(0);
  // A note after a manual refresh ("up to date" / "updated"), tagged with the
  // request it belongs to so it clears itself when the repo/attempt changes.
  const [refreshNote, setRefreshNote] = useState<{ key: string; note: string } | null>(null);
  // The lazy-paging continuation for the *current* request; null while a
  // page fetch is in flight so onNearEnd (fired per render) can't double-load.
  const loadMoreRef = useRef<IngestResult["loadMore"] | null>(null);
  // Continuation for an interrupted backfill (missing tips / eager pages).
  const resumeRef = useRef<IngestResult["resume"] | null>(null);
  const [resuming, setResuming] = useState(false);
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

  // One place turns an ingest result into screen state, so initial load,
  // lazy paging and resume agree on interrupted/hasMore bookkeeping.
  const applyResult = useCallback((result: IngestResult) => {
    loadMoreRef.current = result.loadMore ?? null;
    resumeRef.current = result.resume ?? null;
    historyRef.current = result.history;
    setLoaded({
      key: requestKey,
      history: snapshot(result.history),
      defaultBranch: result.defaultBranch,
      private: result.private === true,
      truncated: result.truncated,
      referencesTruncated: result.referencesTruncated,
      hasMore: result.loadMore !== undefined,
      complete: true,
      ...(result.interrupted ? { interrupted: result.interrupted } : {}),
      ...(result.githubReconnectRequired ? { githubReconnectRequired: true } : {}),
    });
  }, [requestKey]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    requestKeyRef.current = requestKey;
    loadMoreRef.current = null;
    resumeRef.current = null;
    historyRef.current = null;
    pagesLoadedRef.current = 0;
    pagingRetryAt.current = 0;
    firstPaintRef.current = false;
    startedAtRef.current = performance.now();

    fetchPublicRepoHistory(`${owner}/${repo}`, {
      signal: controller.signal,
      onProgress: (h, { defaultBranch, private: repoPrivate, referencesTruncated, githubReconnectRequired }) => {
        if (!cancelled) {
          historyRef.current = h;
          setLoaded({
            key: requestKey,
            history: snapshot(h),
            defaultBranch,
            private: repoPrivate === true,
            truncated: false,
            referencesTruncated,
            githubReconnectRequired,
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
        applyResult(result);
        track({ name: "render_result", props: { ok: true } });
        if (result.interrupted?.code === "rate-limited") track({ name: "rate_limited" });
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
      controller.abort();
      loadMoreRef.current = null;
    };
  }, [owner, repo, requestKey, applyResult]);

  const handleResume = useCallback(() => {
    const resume = resumeRef.current;
    if (!resume || resuming) return;
    resumeRef.current = null;
    setResuming(true);
    resume()
      .then((result) => {
        if (requestKeyRef.current !== requestKey) return;
        applyResult(result);
      })
      .catch(() => {
        if (requestKeyRef.current !== requestKey) return;
        resumeRef.current = resume;
      })
      .finally(() => {
        if (requestKeyRef.current === requestKey) setResuming(false);
      });
  }, [requestKey, resuming, applyResult]);

  const handleNearEnd = useCallback(() => {
    if (Date.now() < pagingRetryAt.current) return;
    const loadMore = loadMoreRef.current;
    if (!loadMore) return;
    loadMoreRef.current = null;
    setLoadingMore(true);
    loadMore()
      .then((result) => {
        if (requestKeyRef.current !== requestKey) return; // navigated away
        pagingRetryAt.current = 0;
        setPagingNote(null);
        applyResult(result);
        pagesLoadedRef.current += 1;
        track({ name: "lazy_page", props: { depth: pagesLoadedRef.current } });
      })
      .catch((cause: unknown) => {
        if (requestKeyRef.current !== requestKey) return;
        const seconds = cause instanceof IngestError && cause.code === "rate-limited" ? cause.retryAfterSeconds : undefined;
        pagingRetryAt.current = seconds ? Date.now() + seconds * 1000 : 0;
        setPagingNote({ key: requestKey, note: seconds
          ? `older commits paused · try again in ${formatRetryWait(seconds)}`
          : "couldn’t load older commits · scroll again to retry" });
        loadMoreRef.current = loadMore;
      })
      .finally(() => setLoadingMore(false));
  }, [requestKey, applyResult]);

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
      .catch((cause: unknown) => {
        if (requestKeyRef.current !== requestKey) return;
        const wait =
          cause instanceof IngestError &&
          cause.code === "rate-limited" &&
          cause.retryAfterSeconds !== undefined &&
          cause.retryAfterSeconds > 0
            ? formatRetryWait(cause.retryAfterSeconds)
            : null;
        setRefreshNote({
          key: requestKey,
          note: wait ? `couldn't refresh · try again in ${wait}` : "couldn't refresh",
        });
      })
      .finally(() => {
        if (requestKeyRef.current === requestKey) setRefreshing(false);
      });
  }, [owner, repo, requestKey, refreshing]);

  const history = loaded?.key === requestKey ? loaded.history : null;
  const defaultBranch = loaded?.key === requestKey ? loaded.defaultBranch : undefined;
  const repoPrivate = loaded?.key === requestKey ? loaded.private === true : false;
  const error = failed?.key === requestKey ? failed.error : null;
  const note = refreshNote?.key === requestKey ? refreshNote.note : null;
  const interrupted = loaded?.key === requestKey ? loaded.interrupted : undefined;
  const reconnectGitHub = loaded?.key === requestKey && loaded.githubReconnectRequired === true;
  const reconnectHref = `/api/github/connect?reconnect=1&returnTo=${encodeURIComponent(
    `/repo/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
  )}`;

  if (error) {
    const retryAfterSeconds =
      error instanceof IngestError ? error.retryAfterSeconds : undefined;
    return (
      <ErrorState
        fill
        title="Couldn't load that repository"
        message={error.message}
        retryAfterSeconds={retryAfterSeconds}
        onRetry={() => setAttempt((n) => n + 1)}
      />
    );
  }
  if (!history) {
    return <LoadingState fill label={`Reading ${owner}/${repo}…`} />;
  }
  if (history.commits.length === 0) {
    return (
      <EmptyState
        fill
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
      defaultBranch={defaultBranch}
      repoPrivate={repoPrivate}
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
          {loaded?.referencesTruncated && " · showing the first 100 branches and 100 tags"}
          {interrupted && (
            <>
              {" · "}
              {interrupted.code === "rate-limited"
                ? `GitHub rate limit paused loading${
                    interrupted.retryAfterSeconds
                      ? ` · try again in ${formatRetryWait(interrupted.retryAfterSeconds)}`
                      : ""
                  } · showing what loaded`
                : "some branches couldn't load"}
              {" · "}
              <button
                type="button"
                className={styles.statusAction}
                onClick={handleResume}
                disabled={resuming}
              >
                {resuming ? "resuming…" : "resume"}
              </button>
            </>
          )}
          {pagingNote?.key === requestKey && ` · ${pagingNote.note}`}
          {reconnectGitHub && (
            <>
              {" · GitHub connection lost, using shared limits · "}
              <a className={styles.statusAction} href={reconnectHref}>reconnect</a>
            </>
          )}
          {!refreshing && note && ` · ${note}`}
        </>
      }
    />
  );
}
