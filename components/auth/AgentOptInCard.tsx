"use client";

import { useState } from "react";
import { Surface } from "@/components/ui/Surface";
import buttonStyles from "@/components/ui/button.module.css";
import styles from "./github-connection.module.css";

export function AgentOptInCard({ initialEnabled }: { initialEnabled: boolean }) {
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

  return (
    <Surface level={1} padded={false} className={styles.card}>
      <div className={styles.header}>
        <div className={styles.heading}>
          <p className={styles.name}>Chronos Agent</p>
          <p className={styles.desc}>
            Opt-in graph Q&amp;A from loaded history. Your question and selected graph context may be sent to our
            ZDR AI gateway — not the whole repo.
          </p>
        </div>
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={`${buttonStyles.button} ${enabled ? buttonStyles.secondary : buttonStyles.primary}`}
          disabled={busy}
          onClick={() => save(!enabled)}
        >
          {enabled ? "Turn off Agent" : "Turn on Agent"}
        </button>
        <span className={enabled ? styles.name : styles.nameMuted}>{enabled ? "On" : "Off"}</span>
      </div>
      {error && <p className={styles.desc}>{error}</p>}
    </Surface>
  );
}
