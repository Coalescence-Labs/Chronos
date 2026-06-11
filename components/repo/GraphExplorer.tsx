"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { GraphView } from "@/components/graph/GraphView";
import { InspectionSurface } from "@/components/ui";
import { DEFAULT_MAX_LANES, layoutGraph } from "@/lib/graph";
import type { RepoHistory } from "@/lib/graph";
import styles from "./repo.module.css";

/**
 * The presentational half of the repo view: header + hybrid lane layout +
 * GraphView + the inspection surface for the selected commit. Takes a ready
 * RepoHistory, so it serves both the live screen (RepoScreen feeds it
 * progressively) and /demo (synthetic history, no network).
 *
 * Layout runs synchronously in useMemo — the perf test on the 20k-commit
 * fixture keeps it inside budget, so no worker yet (revisit if that fails).
 */

const PHONE_MAX_LANES = 8;
const PHONE_BREAKPOINT = 700;

export interface GraphExplorerProps {
  history: RepoHistory;
  owner: string;
  repo: string;
  status?: ReactNode;
  /** Forwarded to GraphView for lazy paging. */
  onNearEnd?: () => void;
}

export function GraphExplorer({ history, owner, repo, status, onNearEnd }: GraphExplorerProps) {
  const [selectedSha, setSelectedSha] = useState<string | null>(null);
  const [maxLanes, setMaxLanes] = useState(DEFAULT_MAX_LANES);

  useEffect(() => {
    const update = () =>
      setMaxLanes(window.innerWidth < PHONE_BREAKPOINT ? PHONE_MAX_LANES : DEFAULT_MAX_LANES);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const layout = useMemo(() => layoutGraph(history, { maxLanes }), [history, maxLanes]);

  const selected = useMemo(
    () => (selectedSha ? history.commits.find((c) => c.sha === selectedSha) : undefined),
    [history, selectedSha],
  );
  const selectedRefs = useMemo(
    () =>
      selectedSha
        ? history.refs.filter((ref) => ref.sha === selectedSha && ref.type !== "head")
        : [],
    [history, selectedSha],
  );

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <h1 className={styles.repoName}>
          {owner}
          <span className={styles.repoSlash}>/</span>
          {repo}
        </h1>
        {status && (
          <p className={styles.status} role="status">
            {status}
          </p>
        )}
      </header>
      <GraphView
        history={history}
        layout={layout}
        selectedSha={selectedSha}
        onSelect={setSelectedSha}
        onNearEnd={onNearEnd}
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
