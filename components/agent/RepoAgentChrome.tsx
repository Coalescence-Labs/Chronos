"use client";

import { useState, type ReactNode } from "react";
import { AgentPanel } from "./AgentPanel";
import type { RepoHistory } from "@/lib/graph";
import buttonStyles from "@/components/ui/button.module.css";
import styles from "./agent.module.css";

interface RepoAgentChromeProps {
  owner: string;
  repo: string;
  history: RepoHistory;
  selectedSha?: string | null;
  children: ReactNode;
}

export function RepoAgentChrome({
  owner,
  repo,
  history,
  selectedSha,
  children,
}: RepoAgentChromeProps) {
  const [mobileTab, setMobileTab] = useState<"graph" | "agent">("graph");

  return (
    <>
      <div className={mobileTab === "agent" ? styles.graphPaneHidden : undefined}>{children}</div>
      <div className={mobileTab === "agent" ? styles.mobilePaneActive : styles.mobilePane}>
        <AgentPanel owner={owner} repo={repo} history={history} selectedSha={selectedSha} />
      </div>
      <div className={`${styles.overlay} ${styles.panel}`} aria-hidden={false}>
        <AgentPanel owner={owner} repo={repo} history={history} selectedSha={selectedSha} />
      </div>
      <nav className={styles.tabBar} aria-label="Repo view">
        <button
          type="button"
          className={`${buttonStyles.button} ${buttonStyles.ghost} ${styles.tabButton}`}
          aria-pressed={mobileTab === "graph"}
          onClick={() => setMobileTab("graph")}
        >
          Graph
        </button>
        <button
          type="button"
          className={`${buttonStyles.button} ${buttonStyles.ghost} ${styles.tabButton}`}
          aria-pressed={mobileTab === "agent"}
          onClick={() => setMobileTab("agent")}
        >
          Agent
        </button>
      </nav>
    </>
  );
}
