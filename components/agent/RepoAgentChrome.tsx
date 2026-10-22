"use client";

import { useState, type ReactNode } from "react";
import { AgentPanel } from "./AgentPanel";
import { AgentMark } from "./AgentMark";
import type { AgentBranchFocus } from "@/lib/agent/chat-context";
import type { RepoHistory } from "@/lib/graph";
import styles from "./agent.module.css";

interface RepoAgentChromeProps {
  owner: string;
  repo: string;
  history: RepoHistory;
  selectedSha?: string | null;
  focusedBranch?: AgentBranchFocus | null;
  children: ReactNode;
}

export function RepoAgentChrome({
  owner,
  repo,
  history,
  selectedSha,
  focusedBranch,
  children,
}: RepoAgentChromeProps) {
  const [mobileTab, setMobileTab] = useState<"graph" | "agent">("graph");
  const [desktopOpen, setDesktopOpen] = useState(true);

  return (
    <>
      <div className={mobileTab === "agent" ? styles.graphPaneHidden : undefined}>{children}</div>

      <div className={mobileTab === "agent" ? styles.mobilePaneActive : styles.mobilePane}>
        <AgentPanel
          layout="mobile"
          owner={owner}
          repo={repo}
          history={history}
          selectedSha={selectedSha}
          focusedBranch={focusedBranch}
        />
      </div>

      <div className={styles.desktopDock} data-open={desktopOpen}>
        {desktopOpen ? (
          <AgentPanel
            layout="desktop"
            owner={owner}
            repo={repo}
            history={history}
            selectedSha={selectedSha}
            focusedBranch={focusedBranch}
            onMinimize={() => setDesktopOpen(false)}
          />
        ) : (
          <button
            type="button"
            className={styles.desktopFab}
            onClick={() => setDesktopOpen(true)}
            aria-label="Open Chronos Agent"
          >
            <span className={styles.desktopFabMark} aria-hidden="true">
              <AgentMark size={18} />
            </span>
            Agent
          </button>
        )}
      </div>

      <nav className={styles.tabBar} aria-label="Repo view">
        <button
          type="button"
          className={`${styles.tabButton} ${mobileTab === "graph" ? styles.tabButtonActive : ""}`}
          aria-pressed={mobileTab === "graph"}
          onClick={() => setMobileTab("graph")}
        >
          Graph
        </button>
        <button
          type="button"
          className={`${styles.tabButton} ${mobileTab === "agent" ? styles.tabButtonActive : ""}`}
          aria-pressed={mobileTab === "agent"}
          onClick={() => setMobileTab("agent")}
        >
          Agent
        </button>
      </nav>
    </>
  );
}
