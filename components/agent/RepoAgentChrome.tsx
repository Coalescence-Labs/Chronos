"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";
import { AgentPanel } from "./AgentPanel";
import { AgentMark } from "./AgentMark";
import type { AgentBranchFocus } from "@/lib/agent/chat-context";
import type { AgentLensTargets } from "@/lib/agent/gen-ui";
import type { RepoHistory } from "@/lib/graph";
import styles from "./agent.module.css";

interface RepoAgentChromeProps {
  owner: string;
  repo: string;
  history: RepoHistory;
  defaultBranch?: string;
  /** When true, Agent skips starters/chat (public-only beta). */
  repoPrivate?: boolean;
  selectedSha?: string | null;
  focusedBranch?: AgentBranchFocus | null;
  onLensChange?: (lens: AgentLensTargets | null) => void;
  onCommitActivate?: (sha: string) => void;
  onBranchActivate?: (name: string, tipSha?: string) => void;
  /** Desktop panel open; when false the collapsed entry lives in the graph header. */
  desktopOpen: boolean;
  onDesktopOpenChange: (open: boolean) => void;
  children: ReactNode;
}

type MobileTab = "graph" | "agent";

function GraphMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="6" cy="18" r="2.25" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="6" cy="6" r="2.25" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="18" cy="12" r="2.25" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M6 8.2v7.6M8.2 6.8 15.8 11M8.2 17.2 15.8 13"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function RepoAgentChrome({
  owner,
  repo,
  history,
  defaultBranch,
  repoPrivate = false,
  selectedSha,
  focusedBranch,
  onLensChange,
  onCommitActivate,
  onBranchActivate,
  desktopOpen,
  onDesktopOpenChange,
  children,
}: RepoAgentChromeProps) {
  const [mobileTab, setMobileTab] = useState<MobileTab>("graph");

  const panelProps = {
    owner,
    repo,
    history,
    defaultBranch,
    repoPrivate,
    selectedSha,
    focusedBranch,
    onLensChange,
    onCommitActivate,
    onBranchActivate,
  } as const;

  const onTabListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next: MobileTab = mobileTab === "graph" ? "agent" : "graph";
    setMobileTab(next);
    const id = next === "graph" ? "repo-tab-graph" : "repo-tab-agent";
    requestAnimationFrame(() => document.getElementById(id)?.focus());
  };

  return (
    <div className={styles.chrome}>
      <div
        id="repo-panel-graph"
        role="tabpanel"
        aria-labelledby="repo-tab-graph"
        className={mobileTab === "agent" ? styles.graphPaneHidden : styles.graphPane}
      >
        {children}
      </div>

      <div
        id="repo-panel-agent"
        role="tabpanel"
        aria-labelledby="repo-tab-agent"
        className={mobileTab === "agent" ? styles.mobilePaneActive : styles.mobilePane}
      >
        <AgentPanel layout="mobile" {...panelProps} />
      </div>

      {desktopOpen ? (
        <div className={styles.desktopDock} data-open="true">
          <AgentPanel
            layout="desktop"
            {...panelProps}
            onMinimize={() => onDesktopOpenChange(false)}
          />
        </div>
      ) : null}

      <nav className={styles.tabBar} aria-label="Repo view">
        <div
          className={styles.tabSegment}
          role="tablist"
          aria-label="Graph or Agent"
          onKeyDown={onTabListKeyDown}
        >
          <button
            type="button"
            role="tab"
            id="repo-tab-graph"
            aria-selected={mobileTab === "graph"}
            aria-controls="repo-panel-graph"
            tabIndex={mobileTab === "graph" ? 0 : -1}
            className={
              mobileTab === "graph" ? `${styles.tabButton} ${styles.tabButtonActive}` : styles.tabButton
            }
            onClick={() => setMobileTab("graph")}
          >
            <GraphMark />
            Graph
          </button>
          <button
            type="button"
            role="tab"
            id="repo-tab-agent"
            aria-selected={mobileTab === "agent"}
            aria-controls="repo-panel-agent"
            tabIndex={mobileTab === "agent" ? 0 : -1}
            className={
              mobileTab === "agent" ? `${styles.tabButton} ${styles.tabButtonActive}` : styles.tabButton
            }
            onClick={() => setMobileTab("agent")}
          >
            <AgentMark size={16} />
            Agent
          </button>
        </div>
      </nav>
    </div>
  );
}
