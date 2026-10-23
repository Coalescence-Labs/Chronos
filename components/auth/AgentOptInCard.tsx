"use client";

import { Fragment, useState } from "react";
import { Surface } from "@/components/ui/Surface";
import { Button } from "@/components/ui/Button";
import { AgentMark } from "@/components/agent/AgentMark";
import type { AgentSpendUsage } from "@/lib/agent/spend";
import { DevMissingEnvList } from "./DevMissingEnvList";
import styles from "./github-connection.module.css";

const AGENT_FACTS: { claim: string; detail: string }[] = [
  { claim: "Graph context only", detail: "Questions use commits already loaded in your browser — not the whole repo." },
  { claim: "Public repos for now", detail: "Private-repo Agent waits until zero-retention AI is enabled." },
  { claim: "Opt-in", detail: "Off until you turn it on here." },
];

function AgentFacts({ className }: { className?: string }) {
  return (
    <dl className={className}>
      {AGENT_FACTS.map((fact) => (
        <Fragment key={fact.claim}>
          <dt>{fact.claim}</dt>
          <dd>{fact.detail}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

function formatUsageReset(resetsAt: string): string {
  const label = new Date(resetsAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return `Resets ${label}`;
}

function AgentUsageMeter({ percentUsed, resetsAt }: { percentUsed: number; resetsAt: string }) {
  const clamped = Math.min(100, Math.max(0, percentUsed));
  return (
    <div className={styles.usage} aria-label="Agent usage">
      <div className={styles.usageMeta}>
        <span className={styles.usagePercent}>{clamped}% used</span>
        <span className={styles.usageReset}>{formatUsageReset(resetsAt)}</span>
      </div>
      <div
        className={styles.usageTrack}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
        aria-valuetext={`${clamped}% used`}
      >
        <div className={styles.usageFill} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}

export interface AgentOptInCardProps {
  initialEnabled: boolean;
  configured: boolean;
  missingEnvVars?: string[];
  /** Present only when spend Redis is ready; omit or `{ available: false }` to hide. */
  usage?: AgentSpendUsage;
}

export function AgentOptInCard({
  initialEnabled,
  configured,
  missingEnvVars,
  usage,
}: AgentOptInCardProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (next: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/agent/opt-in", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof payload.error === "string" ? payload.error : "Could not update Agent setting");
        return;
      }
      setEnabled(next);
    } catch {
      setError("Could not update Agent setting");
    } finally {
      setBusy(false);
    }
  };

  if (!configured) {
    return (
      <Surface level={1} padded={false} className={styles.card}>
        <div className={styles.header}>
          <span className={`${styles.glyph} ${styles.glyphMuted}`} aria-hidden="true">
            <AgentMark />
          </span>
          <div className={styles.heading}>
            <h3 className={`${styles.name} ${styles.nameMuted}`}>
              Chronos Agent <span className={styles.badge}>unavailable</span>
            </h3>
            <p className={styles.desc}>Chronos Agent isn’t available in this deployment.</p>
            <DevMissingEnvList names={missingEnvVars} />
          </div>
        </div>
      </Surface>
    );
  }

  return (
    <Surface level={1} padded={false} className={styles.card}>
      <div className={styles.header}>
        <span className={styles.glyph} aria-hidden="true">
          <AgentMark />
        </span>
        <div className={styles.heading}>
          <h3 className={styles.name}>
            Chronos Agent{" "}
            {enabled ? (
              <span className={styles.badge} data-connected="">
                <span className={styles.badgeDot} aria-hidden="true" />
                on
              </span>
            ) : (
              <span className={styles.badge}>off</span>
            )}
          </h3>
          <p className={styles.desc}>
            Ask questions about the graph you’re viewing. Sends your question and loaded commit context to the AI
            gateway — public repos only for now.
          </p>
        </div>
      </div>
      <div className={styles.actions}>
        <Button
          variant={enabled ? "ghost" : "primary"}
          disabled={busy}
          onClick={() => save(!enabled)}
        >
          {enabled ? "Turn off Agent" : "Turn on Agent"}
        </Button>
        {error && <p className={styles.actionError}>{error}</p>}
      </div>
      {enabled && usage?.available === true && (
        <AgentUsageMeter percentUsed={usage.percentUsed} resetsAt={usage.resetsAt} />
      )}
      {!enabled && <AgentFacts className={styles.facts} />}
    </Surface>
  );
}
