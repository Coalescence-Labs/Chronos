"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { RepoHistory } from "@/lib/graph";
import { Surface } from "@/components/ui/Surface";
import buttonStyles from "@/components/ui/button.module.css";
import {
  CHRONOS_AGENT_CONTEXT_MIME,
  mergeContextRefs,
  parseAgentContextDrop,
  type AgentBranchFocus,
  type AgentChatContextRef,
} from "@/lib/agent/chat-context";
import { revealAgentText } from "./reveal-stream";
import styles from "./agent.module.css";

const STARTERS = [
  "Recent merges into default?",
  "Branches that share a parent?",
] as const;

const BETA_SCOPE_TOOLTIP =
  "Answers use commits already loaded in this view. Public repos only for now.";

type TurnStatus = "complete" | "streaming" | "thinking" | "error";

interface AgentTurn {
  id: string;
  role: "user" | "assistant";
  body?: string;
  html?: string;
  error?: string;
  stamp: string;
  status: TurnStatus;
}

interface AgentPanelProps {
  owner: string;
  repo: string;
  history: RepoHistory;
  selectedSha?: string | null;
  focusedBranch?: AgentBranchFocus | null;
  layout?: "desktop" | "mobile";
  onMinimize?: () => void;
  className?: string;
}

function formatStamp(date = new Date()): string {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m5 12 14-7-7 14-2-5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function PublicBetaBadge() {
  const tipId = useId();
  return (
    <span className={styles.betaBadgeWrap}>
      <button
        type="button"
        className={styles.betaPill}
        aria-describedby={tipId}
        aria-label="Public beta — scope and limits"
      >
        Public beta
      </button>
      <span id={tipId} role="tooltip" className={styles.betaTooltip}>
        {BETA_SCOPE_TOOLTIP}
      </span>
    </span>
  );
}

export function AgentPanel({
  owner,
  repo,
  history,
  selectedSha,
  focusedBranch = null,
  layout = "desktop",
  onMinimize,
  className,
}: AgentPanelProps) {
  const inputId = useId();
  const threadRef = useRef<HTMLDivElement>(null);
  const revealAbortRef = useRef<AbortController | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<AgentTurn[]>([]);
  const [loadHandle, setLoadHandle] = useState<string | null>(null);
  const [contextRefs, setContextRefs] = useState<AgentChatContextRef[]>([]);
  const [dropActive, setDropActive] = useState(false);
  const dragDepthRef = useRef(0);

  const scrollThread = useCallback(() => {
    const node = threadRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, []);

  useEffect(() => {
    scrollThread();
  }, [turns, scrollThread]);

  const addContextRef = useCallback((ref: AgentChatContextRef) => {
    setContextRefs((current) => mergeContextRefs(current, [ref]));
  }, []);

  const removeContextRef = useCallback((key: string) => {
    setContextRefs((current) =>
      current.filter((ref) => `${ref.kind}:${ref.sha}:${ref.label}` !== key),
    );
  }, []);

  const ask = async (rawQuestion: string) => {
    const trimmed = rawQuestion.trim();
    if (!trimmed || busy) return;
    const refsForTurn = contextRefs;
    setDraft("");
    setContextRefs([]);
    setBusy(true);
    revealAbortRef.current?.abort();
    const assistantId = crypto.randomUUID();
    setTurns((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: "user",
        body: trimmed,
        stamp: formatStamp(),
        status: "complete",
      },
      { id: assistantId, role: "assistant", stamp: formatStamp(), status: "thinking" },
    ]);

    try {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          owner,
          repo,
          history,
          selectedSha,
          focusedBranch,
          contextRefs: refsForTurn,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!payload.ok) {
        const message = typeof payload.error === "string" ? payload.error : "Agent unavailable";
        setTurns((current) =>
          current.map((turn) =>
            turn.id === assistantId
              ? { ...turn, status: "error", error: message, stamp: formatStamp() }
              : turn,
          ),
        );
        return;
      }

      if (typeof payload.loadHandle === "string") setLoadHandle(payload.loadHandle);

      const text = typeof payload.text === "string" ? payload.text : "";
      const html = typeof payload.html === "string" ? payload.html : "";
      if (!text && !html) {
        setTurns((current) =>
          current.map((turn) =>
            turn.id === assistantId
              ? { ...turn, status: "error", error: "Empty response", stamp: formatStamp() }
              : turn,
          ),
        );
        return;
      }

      const controller = new AbortController();
      revealAbortRef.current = controller;
      setTurns((current) =>
        current.map((turn) =>
          turn.id === assistantId ? { ...turn, status: "streaming", body: "" } : turn,
        ),
      );

      await revealAgentText(
        text || html.replace(/<[^>]+>/g, " "),
        (partial) => {
          setTurns((current) =>
            current.map((turn) =>
              turn.id === assistantId ? { ...turn, body: partial, status: "streaming" } : turn,
            ),
          );
        },
        controller.signal,
      );

      setTurns((current) =>
        current.map((turn) =>
          turn.id === assistantId
            ? { ...turn, html, body: undefined, status: "complete", stamp: formatStamp() }
            : turn,
        ),
      );
    } catch {
      setTurns((current) =>
        current.map((turn) =>
          turn.id === assistantId
            ? { ...turn, status: "error", error: "Agent unavailable", stamp: formatStamp() }
            : turn,
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  const shellClass =
    layout === "mobile"
      ? `${styles.panelShell} ${styles.panelShellMobile} ${styles.mobileShell}`
      : `${styles.panelShell} ${styles.desktopPanel}`;

  const headerClass = layout === "mobile" ? styles.mobileHeader : styles.desktopHeader;

  return (
    <Surface level={3} padded={false} className={`${shellClass} ${className ?? ""}`}>
      <header className={headerClass}>
        <div className={layout === "mobile" ? undefined : styles.desktopHeaderText}>
          <p className={styles.chromeEyebrow}>Chronos Agent</p>
          <h2 className={styles.panelTitle}>
            Graph Q&amp;A <PublicBetaBadge />
          </h2>
        </div>
        {onMinimize && (
          <button type="button" className={styles.desktopMinimize} onClick={onMinimize} aria-label="Minimize Agent">
            ✕
          </button>
        )}
      </header>

      <div className={styles.thread} ref={threadRef} aria-live="polite">
        {turns.length === 0 ? (
          <div className={styles.emptyState}>
            <h3 className={styles.emptyTitle}>Ask about this graph</h3>
            <p className={styles.emptyLead}>
              Answers use commits already loaded in this view — no invented history.
            </p>
            <ul className={styles.promptRow} aria-label="Example questions">
              {STARTERS.map((prompt) => (
                <li key={prompt}>
                  <button
                    type="button"
                    className={styles.promptChip}
                    disabled={busy}
                    onClick={() => void ask(prompt)}
                  >
                    {prompt}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ul className={styles.messageList}>
            {turns.map((turn) => (
              <li key={turn.id} className={styles.messageRow} data-role={turn.role}>
                {turn.role === "user" && turn.body && (
                  <div>
                    <p className={styles.messageMeta}>You · {turn.stamp}</p>
                    <p className={styles.userBubble}>{turn.body}</p>
                  </div>
                )}
                {turn.role === "assistant" && (
                  <div className={styles.assistantShell}>
                    <span className={styles.assistantMark} aria-hidden="true" />
                    <div className={styles.assistantBody}>
                      <p className={styles.messageMeta}>Agent · {turn.stamp}</p>
                      {turn.status === "thinking" && (
                        <div className={styles.thinking}>
                          <span className={styles.thinkingLabel}>Reading graph</span>
                          <span className={styles.thinkingDots} aria-hidden="true">
                            <span />
                            <span />
                            <span />
                          </span>
                        </div>
                      )}
                      {turn.status === "streaming" && turn.body !== undefined && (
                        <p className={styles.assistantStreaming}>{turn.body}</p>
                      )}
                      {turn.status === "complete" && turn.html && (
                        <div dangerouslySetInnerHTML={{ __html: turn.html }} />
                      )}
                      {turn.status === "error" && (
                        <p className={styles.errorBubble} role="alert">
                          {turn.error}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className={styles.footer}>
        <form
          className={`${styles.composerShell} ${dropActive ? styles.composerDropActive : ""}`}
          onSubmit={(event) => {
            event.preventDefault();
            void ask(draft);
          }}
          onDragEnter={(event) => {
            const types = [...event.dataTransfer.types];
            if (!types.includes(CHRONOS_AGENT_CONTEXT_MIME) && !types.includes("text/plain")) return;
            event.preventDefault();
            dragDepthRef.current += 1;
            setDropActive(true);
          }}
          onDragOver={(event) => {
            const types = [...event.dataTransfer.types];
            if (!types.includes(CHRONOS_AGENT_CONTEXT_MIME) && !types.includes("text/plain")) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            setDropActive(true);
          }}
          onDragLeave={() => {
            dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
            if (dragDepthRef.current === 0) setDropActive(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            dragDepthRef.current = 0;
            setDropActive(false);
            const ref = parseAgentContextDrop(event.dataTransfer);
            if (ref) addContextRef(ref);
          }}
        >
          {contextRefs.length > 0 && (
            <ul className={styles.contextChips} aria-label="Graph context">
              {contextRefs.map((ref) => {
                const chipKey = `${ref.kind}:${ref.sha}:${ref.label}`;
                return (
                  <li key={chipKey}>
                    <span className={styles.contextChip} data-kind={ref.kind}>
                      <span className={styles.contextChipKind}>
                        {ref.kind === "branch" ? "branch" : "commit"}
                      </span>
                      <span className={styles.contextChipLabel}>{ref.label}</span>
                      <button
                        type="button"
                        className={styles.contextChipRemove}
                        aria-label={`Remove ${ref.label} from context`}
                        onClick={() => removeContextRef(chipKey)}
                      >
                        ×
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <div className={styles.composerForm}>
            <label className={styles.visuallyHidden} htmlFor={inputId}>
              Ask Chronos Agent
            </label>
            <textarea
              id={inputId}
              className={styles.composerInput}
              rows={3}
              value={draft}
              disabled={busy}
              placeholder="Ask about this graph…"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void ask(draft);
                }
              }}
            />
            <button
              type="submit"
              className={`${buttonStyles.button} ${buttonStyles.primary} ${styles.sendButton}`}
              disabled={busy || !draft.trim()}
              aria-label="Send question"
            >
              <SendIcon />
            </button>
          </div>
        </form>
        <p className={styles.snapshotStamp}>
          <span className={styles.snapshotRepo}>
            {owner}/{repo}
          </span>
          {focusedBranch ? (
            <>
              {" · "}
              <span className={styles.snapshotFocus}>
                focused: <span className={styles.snapshotHandle}>{focusedBranch.name}</span>
              </span>
            </>
          ) : null}
          {selectedSha ? (
            <>
              {" · "}
              <span className={styles.snapshotTip}>inspect </span>
              <span className={styles.snapshotHandle}>{selectedSha.slice(0, 7)}</span>
            </>
          ) : null}
          {loadHandle ? (
            <>
              {" · "}
              <span className={styles.snapshotHandle}>{loadHandle}</span>
            </>
          ) : null}
        </p>
      </footer>
    </Surface>
  );
}
