"use client";

import { useEffect, useMemo, useState } from "react";
import { GraphView } from "@/components/graph/GraphView";
import { EmptyState, ErrorState, InspectionSurface, LoadingState } from "@/components/ui";
import { DEFAULT_MAX_LANES, layoutGraph } from "@/lib/graph";
import type { RepoHistory } from "@/lib/graph";
import { fetchPublicRepoHistory, IngestError } from "@/lib/ingest";
import styles from "./repo.module.css";

/**
 * The end-to-end view (COA-71): progressive ingestion → hybrid lane layout →
 * GraphView, with the inspection surface for tap-to-inspect. Pages stream in
 * via onProgress so the first 100 commits render before the rest arrive.
 *
 * Layout runs synchronously in useMemo — the perf test on the 20k-commit
 * fixture keeps it inside budget, so no worker yet (revisit if that fails).
 */

const PHONE_MAX_LANES = 8;
const PHONE_BREAKPOINT = 700;

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
  const [selectedSha, setSelectedSha] = useState<string | null>(null);
  const [maxLanes, setMaxLanes] = useState(DEFAULT_MAX_LANES);

  useEffect(() => {
    const update = () =>
      setMaxLanes(window.innerWidth < PHONE_BREAKPOINT ? PHONE_MAX_LANES : DEFAULT_MAX_LANES);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

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

  const layout = useMemo(
    () => (history ? layoutGraph(history, { maxLanes }) : null),
    [history, maxLanes],
  );

  const selected = useMemo(
    () => (history && selectedSha ? history.commits.find((c) => c.sha === selectedSha) : undefined),
    [history, selectedSha],
  );
  const selectedRefs = useMemo(
    () =>
      history && selectedSha
        ? history.refs.filter((ref) => ref.sha === selectedSha && ref.type !== "head")
        : [],
    [history, selectedSha],
  );

  if (error) {
    return (
      <ErrorState
        title="Couldn't load that repository"
        message={error.message}
        onRetry={() => setAttempt((n) => n + 1)}
      />
    );
  }
  if (!history || !layout) {
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
    <div className={styles.screen}>
      <header className={styles.header}>
        <h1 className={styles.repoName}>
          {owner}
          <span className={styles.repoSlash}>/</span>
          {repo}
        </h1>
        <p className={styles.status} role="status">
          {history.commits.length.toLocaleString()} commits
          {!loaded?.complete && " · loading more…"}
          {loaded?.complete && loaded.truncated && " · showing the most recent pages of a longer history"}
        </p>
      </header>
      <GraphView
        history={history}
        layout={layout}
        selectedSha={selectedSha}
        onSelect={setSelectedSha}
      />
      <InspectionSurface
        open={selected !== undefined}
        onClose={() => setSelectedSha(null)}
        title={selected ? `Commit ${selected.sha.slice(0, 7)}` : "Commit"}
      >
        {selected && (
          <dl className={styles.details}>
            <dt>Message</dt>
            <dd>{selected.message}</dd>
            <dt>Author</dt>
            <dd>{selected.author}</dd>
            <dt>Date</dt>
            <dd>{new Date(selected.date).toLocaleString()}</dd>
            <dt>SHA</dt>
            <dd className={styles.mono}>{selected.sha}</dd>
            <dt>{selected.parents.length === 1 ? "Parent" : "Parents"}</dt>
            <dd className={styles.mono}>
              {selected.parents.length === 0
                ? "none (root commit)"
                : selected.parents.map((p) => p.slice(0, 7)).join(", ")}
            </dd>
            {selectedRefs.length > 0 && (
              <>
                <dt>Refs</dt>
                <dd>{selectedRefs.map((ref) => ref.name).join(", ")}</dd>
              </>
            )}
          </dl>
        )}
      </InspectionSurface>
    </div>
  );
}
