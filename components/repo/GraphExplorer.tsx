"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { GraphView } from "@/components/graph/GraphView";
import { CopyButton, InspectionSurface } from "@/components/ui";
import { applyGlance, DEFAULT_MAX_LANES, layoutGraph } from "@/lib/graph";
import type { Capsule, RepoHistory } from "@/lib/graph";
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

const GLANCE_ON = { hideMergedIntoDefault: true, collapseMergedIntoNonDefault: true };
const NO_CAPSULES: Map<string, Capsule> = new Map();

export interface GraphExplorerProps {
  history: RepoHistory;
  owner: string;
  repo: string;
  status?: ReactNode;
  /** Forwarded to GraphView for lazy paging. */
  onNearEnd?: () => void;
  /** Re-sync branch tips (COA-100); omitted on /demo (no network). */
  onRefresh?: () => void;
  refreshing?: boolean;
}

export function GraphExplorer({
  history,
  owner,
  repo,
  status,
  onNearEnd,
  onRefresh,
  refreshing = false,
}: GraphExplorerProps) {
  const [selectedSha, setSelectedSha] = useState<string | null>(null);
  const [glance, setGlance] = useState(false);
  const [reflowing, setReflowing] = useState(false);
  const [maxLanes, setMaxLanes] = useState(DEFAULT_MAX_LANES);

  useEffect(() => {
    const update = () =>
      setMaxLanes(window.innerWidth < PHONE_BREAKPOINT ? PHONE_MAX_LANES : DEFAULT_MAX_LANES);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Toggling Glance restructures the graph: rows/nodes glide to new positions
  // while the edges (whose paths can't tween) fade out and reform. `reflowing`
  // marks that brief window. Skips the initial mount.
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    setReflowing(true);
    const timer = setTimeout(() => setReflowing(false), 280);
    return () => clearTimeout(timer);
  }, [glance]);

  // One glance transform per history; reused to both gate the toggle (applied
  // is false when no default branch) and supply the glanced view when on.
  const glanced = useMemo(() => applyGlance(history, GLANCE_ON), [history]);
  const canGlance = glanced.applied;
  const view = glance && canGlance ? glanced.history : history;
  const capsules = glance && canGlance ? glanced.capsules : NO_CAPSULES;

  const layout = useMemo(() => layoutGraph(view, { maxLanes }), [view, maxLanes]);

  const selected = useMemo(
    () => (selectedSha ? view.commits.find((c) => c.sha === selectedSha) : undefined),
    [view, selectedSha],
  );
  const selectedRefs = useMemo(
    () =>
      selectedSha
        ? view.refs.filter((ref) => ref.sha === selectedSha && ref.type !== "head")
        : [],
    [view, selectedSha],
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
        <div className={styles.actions}>
          {onRefresh && (
            <button
              type="button"
              className={styles.refreshButton}
              onClick={onRefresh}
              disabled={refreshing}
              aria-busy={refreshing}
              aria-label="Refresh — re-sync branch tips"
              title="Refresh — re-sync branch tips"
            >
              <RefreshIcon spinning={refreshing} />
            </button>
          )}
          <button
            type="button"
            className={styles.glanceToggle}
            aria-pressed={glance}
            disabled={!canGlance}
            title={
              canGlance
                ? "Hide merged branches and collapse staged ones"
                : "Glance needs an identifiable default branch"
            }
            onClick={() => setGlance((on) => !on)}
          >
            Glance
          </button>
        </div>
      </header>
      <GraphView
        history={view}
        layout={layout}
        capsules={capsules}
        reflowing={reflowing}
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
            <dd>
              <CopyButton value={selected.sha} label="Copy full SHA">
                {selected.sha}
              </CopyButton>
            </dd>
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

/** Circular-arrow glyph; spins while a refresh is in flight (reduced-motion
 * neutralizes the spin via the global override in globals.css). */
function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      className={spinning ? styles.spin : undefined}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}
