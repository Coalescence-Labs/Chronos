"use client";

import { useId, useState } from "react";
import type { RepoHistory } from "@/lib/graph";
import { Surface } from "@/components/ui/Surface";
import buttonStyles from "@/components/ui/button.module.css";
import styles from "./agent.module.css";

interface AgentPanelProps {
  owner: string;
  repo: string;
  history: RepoHistory;
  selectedSha?: string | null;
  className?: string;
}

export function AgentPanel({ owner, repo, history, selectedSha, className }: AgentPanelProps) {
  const inputId = useId();
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [answerHtml, setAnswerHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ask = async () => {
    const trimmed = question.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    setAnswerHtml(null);
    try {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: trimmed, owner, repo, history, selectedSha }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!payload.ok) {
        setError(typeof payload.error === "string" ? payload.error : "Agent unavailable");
        return;
      }
      setAnswerHtml(typeof payload.html === "string" ? payload.html : null);
    } catch {
      setError("Agent unavailable");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Surface level={2} className={`${styles.panel} ${className ?? ""}`}>
      <p className={styles.message}>Ask about the loaded graph. Answers use facts from this view only.</p>
      <div className={styles.inputRow}>
        <label className={styles.message} htmlFor={inputId}>
          Question
        </label>
        <input
          id={inputId}
          className={styles.input}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="What merged recently?"
          disabled={busy}
        />
        <button type="button" className={`${buttonStyles.button} ${buttonStyles.primary}`} disabled={busy} onClick={ask}>
          Ask
        </button>
      </div>
      {error && <p className={styles.message}>{error}</p>}
      {answerHtml && (
        <div
          className={styles.messages}
          // Model output is sanitized server-side before HTML is returned.
          dangerouslySetInnerHTML={{ __html: answerHtml }}
        />
      )}
    </Surface>
  );
}
