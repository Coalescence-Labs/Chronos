"use client";

import { setAgentContextDragData } from "@/lib/agent/chat-context";
import { stapleRole, type ActiveBranch } from "@/lib/graph";
import { branchColor } from "./geometry";
import styles from "./graph.module.css";

/**
 * Stable ranked catalog of live active branches (≤25). Not tip-row labels —
 * a Glance-era overview of what's still open, in trunk → staging → tip order.
 */

export interface ActiveBranchRailProps {
  branches: readonly ActiveBranch[];
  tracedTip?: string | null;
  onActivate: (branch: ActiveBranch) => void;
}

function branchRole(branch: ActiveBranch): "main" | "develop" | undefined {
  const role = stapleRole(branch.name, branch.kind === "default" ? branch.name : undefined);
  return role === "trunk" ? "main" : role;
}

export function ActiveBranchRail({
  branches,
  tracedTip = null,
  onActivate,
}: ActiveBranchRailProps) {
  if (branches.length === 0) return null;

  return (
    <div className={styles.branchRail} aria-label="Active branches">
      <p className={styles.branchRailLabel}>
        Active
        <span className={styles.branchRailCount}>{branches.length}</span>
      </p>
      <ul className={styles.branchRailList}>
        {branches.map((branch) => {
          const traced = tracedTip === branch.tipSha;
          const role = branchRole(branch);
          const color = branchColor(
            branch.name,
            branch.lane,
            branch.kind === "default" ? branch.name : undefined,
          );
          return (
            <li key={branch.name} className={styles.branchRailItem}>
              <button
                type="button"
                className={styles.branchRailBadge}
                data-kind={branch.kind}
                data-branch-role={role}
                data-traced={traced || undefined}
                style={{
                  color,
                  borderColor: color,
                }}
                title={`${branch.name} — jump to tip and trace`}
                aria-pressed={traced}
                draggable
                onDragStart={(event) => {
                  setAgentContextDragData(event.dataTransfer, {
                    kind: "branch",
                    sha: branch.tipSha,
                    label: branch.name,
                  });
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  onActivate(branch);
                }}
              >
                {branch.name}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
