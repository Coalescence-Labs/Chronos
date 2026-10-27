"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { RepoHistory } from "@/lib/graph";
import { Button } from "@/components/ui/Button";
import { Surface } from "@/components/ui/Surface";
import {
  CHRONOS_AGENT_CONTEXT_MIME,
  mergeContextRefs,
  parseAgentContextDrop,
  type AgentBranchFocus,
  type AgentChatContextRef,
} from "@/lib/agent/chat-context";
import type { AgentGenUiPart, AgentLensTargets } from "@/lib/agent/gen-ui";
import { sanitizeAgentGenUiParts } from "@/lib/agent/gen-ui";
import { renderSafeAgentMarkdown } from "@/lib/agent/safe-markdown";
import {
  STARTER_SLOT_COUNT,
  clearClientStarterCache,
  readClientStarterCache,
  writeClientStarterCache,
} from "@/lib/agent/starters/client-cache";
import { staticAgentStarters } from "@/lib/agent/starters/fallback";
import {
  paintFromLocalCache,
  paintFromStartersApi,
  paintFromStartersFetchFailure,
  type StartersPhase,
} from "@/lib/agent/starters/paint";
import { parseStartersPayload, type AgentStarter } from "@/lib/agent/starters/schema";
import { AgentAnswerView } from "./gen-ui";
import { AgentRippleText } from "./RippleText";
import { revealAgentText } from "./reveal-stream";
import styles from "./agent.module.css";

const BETA_SCOPE_TOOLTIP =
  "Answers use commits already loaded in this view. Public repos only for now.";

type TurnStatus = "complete" | "streaming" | "thinking" | "error";

interface AgentTurn {
  id: string;
  role: "user" | "assistant";
  body?: string;
  html?: string;
  parts?: AgentGenUiPart[];
  error?: string;
  stamp: string;
  status: TurnStatus;
}

interface AgentPanelProps {
  owner: string;
  repo: string;
  history: RepoHistory;
  /** GitHub/API default branch when known (COA-211); falls back to main/master/trunk heuristic. */
  defaultBranch?: string;
  selectedSha?: string | null;
  focusedBranch?: AgentBranchFocus | null;
  layout?: "desktop" | "mobile";
  onMinimize?: () => void;
  /** Soft GraphView lens from the latest assistant answer (concept A). */
  onLensChange?: (lens: AgentLensTargets | null) => void;
  onCommitActivate?: (sha: string) => void;
  onBranchActivate?: (name: string, tipSha?: string) => void;
  className?: string;
}

function formatStamp(date = new Date()): string {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
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
  defaultBranch,
  selectedSha,
  focusedBranch = null,
  layout = "desktop",
  onMinimize,
  onLensChange,
  onCommitActivate,
  onBranchActivate,
  className,
}: AgentPanelProps) {
  const inputId = useId();
  const threadRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const revealAbortRef = useRef<AbortController | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<AgentTurn[]>([]);
  const [contextRefs, setContextRefs] = useState<AgentChatContextRef[]>([]);
  const [dropActive, setDropActive] = useState(false);
  const dragDepthRef = useRef(0);
  const fallbackStarters = useMemo(
    () => staticAgentStarters(history, defaultBranch),
    [history, defaultBranch],
  );
  const [starters, setStarters] = useState<AgentStarter[]>([]);
  const [startersPhase, setStartersPhase] = useState<StartersPhase>("loading");
  const cacheInput = useMemo(
    () => ({ owner, repo, history, defaultBranch }),
    [owner, repo, history, defaultBranch],
  );
  const [paintedCacheInput, setPaintedCacheInput] = useState<typeof cacheInput | null>(null);

  // Instant paint from last-known chips when snapshot material matches.
  // On cache miss, keep already-painted chips (history fingerprint can change as the
  // graph progressive-loads) so we never flash empty → skeleton → chips again.
  // Adjust during render (not an effect) so the first paint already has chips.
  if (turns.length === 0 && paintedCacheInput !== cacheInput) {
    setPaintedCacheInput(cacheInput);
    const paint = paintFromLocalCache(readClientStarterCache(cacheInput));
    if (paint.phase === "ready") {
      setStarters(paint.starters);
      setStartersPhase("ready");
    } else if (startersPhase !== "ready" && startersPhase !== "fallback") {
      setStartersPhase("loading");
    }
  }

  useEffect(() => {
    if (turns.length > 0) return;
    let cancelled = false;
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch("/api/agent/starters", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            owner,
            repo,
            history,
            defaultBranch,
          }),
        });
        const payload = await response.json().catch(() => null);
        if (cancelled || !payload || typeof payload !== "object") return;
        const parsed = parseStartersPayload({ starters: payload.starters });
        const paint = paintFromStartersApi({
          source: typeof payload.source === "string" ? payload.source : undefined,
          starters: parsed?.starters ?? null,
          fallback: fallbackStarters,
        });
        if (cancelled) return;
        if (paint.clearLocalCache) clearClientStarterCache(cacheInput);
        if (paint.writeLocalCache) {
          writeClientStarterCache(
            cacheInput,
            paint.starters,
            typeof payload.snapshotHash === "string" ? payload.snapshotHash : undefined,
          );
        }
        setStarters(paint.starters);
        setStartersPhase(paint.phase);
      } catch {
        if (cancelled) return;
        // Fail open: keep local chips if painted; else static (not infinite skeletons).
        setStarters((current) =>
          paintFromStartersFetchFailure({
            currentPhase: current.length > 0 ? "ready" : "loading",
            currentStarters: current,
            fallback: fallbackStarters,
          }).starters,
        );
        setStartersPhase((phase) => (phase === "ready" ? "ready" : "fallback"));
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [cacheInput, owner, repo, history, defaultBranch, turns.length, fallbackStarters]);

  const scrollThread = useCallback(() => {
    const node = threadRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, []);

  useEffect(() => {
    scrollThread();
  }, [turns, scrollThread]);

  const resizeComposer = useCallback(() => {
    const node = composerRef.current;
    if (!node) return;
    // Idle: drop inline height so CSS `height: 2.75rem` owns the footprint (no
    // hydrate jump from scrollHeight vs font metrics).
    if (!draft) {
      node.style.height = "";
      return;
    }
    node.style.height = "auto";
    const next = Math.min(node.scrollHeight, 160);
    node.style.height = `${Math.max(next, 44)}px`;
  }, [draft]);

  useEffect(() => {
    resizeComposer();
  }, [draft, resizeComposer]);

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
          // Desktop dock ~400px outer / ~360px content; phone tab still a narrow column.
          ui: {
            surface: "narrow-panel",
            density: "narrow",
            approxWidthPx: layout === "mobile" ? 390 : 360,
          },
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

      const text = typeof payload.text === "string" ? payload.text : "";
      const html = typeof payload.html === "string" ? payload.html : "";
      const parts = Array.isArray(payload.parts)
        ? sanitizeAgentGenUiParts(payload.parts)
        : undefined;
      const lens =
        payload.lens && typeof payload.lens === "object"
          ? (payload.lens as AgentLensTargets)
          : null;
      if (!text && !html && !(parts && parts.length > 0)) {
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
            ? {
                ...turn,
                html,
                parts: parts && parts.length > 0 ? parts : undefined,
                body: undefined,
                status: "complete",
                stamp: formatStamp(),
              }
            : turn,
        ),
      );
      onLensChange?.(
        lens && (lens.shas?.length > 0 || lens.branches?.length > 0)
          ? {
              shas: Array.isArray(lens.shas) ? lens.shas.slice(0, 12) : [],
              branches: Array.isArray(lens.branches) ? lens.branches.slice(0, 8) : [],
            }
          : null,
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
        <div className={styles.headerText}>
          <p className={styles.chromeEyebrow}>Chronos Agent</p>
          <div className={styles.titleBlock}>
            <div className={styles.titleRow}>
              <h2 className={styles.panelTitle}>Graph Q&amp;A</h2>
              <PublicBetaBadge />
            </div>
          </div>
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
            <div
              className={styles.promptStack}
              role="group"
              aria-label={
                startersPhase === "loading" ? "Loading example questions" : "Example questions"
              }
              aria-busy={startersPhase === "loading"}
            >
              {startersPhase === "loading"
                ? Array.from({ length: STARTER_SLOT_COUNT }, (_, index) => (
                    <span
                      key={`starter-skeleton-${index}`}
                      className={styles.promptChipSkeleton}
                      data-skeleton-index={index}
                      aria-hidden="true"
                    />
                  ))
                : (
                    <>
                      {starters.map((starter) => (
                        <button
                          key={starter.id}
                          type="button"
                          className={styles.promptChip}
                          disabled={busy}
                          onClick={() => void ask(starter.prompt)}
                        >
                          {starter.label}
                        </button>
                      ))}
                      {/* Invisible slots keep stack height at STARTER_SLOT_COUNT. */}
                      {Array.from(
                        { length: Math.max(0, STARTER_SLOT_COUNT - starters.length) },
                        (_, index) => (
                          <span
                            key={`starter-slot-${index}`}
                            className={styles.promptChipSlot}
                            aria-hidden="true"
                          />
                        ),
                      )}
                    </>
                  )}
            </div>
          </div>
        ) : (
          <ul className={styles.messageList}>
            {turns.map((turn) => (
              <li key={turn.id} className={styles.messageRow} data-role={turn.role}>
                {turn.role === "user" && turn.body && (
                  <div
                    className={`${styles.userBubble} ${styles.md}`}
                    dangerouslySetInnerHTML={{ __html: renderSafeAgentMarkdown(turn.body) }}
                  />
                )}
                {turn.role === "assistant" && (
                  <div className={styles.assistantShell}>
                    <span className={styles.assistantMark} aria-hidden="true" />
                    <div className={styles.assistantBody}>
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
                      {/* Plain text while revealing — ripple/chunking agent owns stream UX. */}
                      {turn.status === "streaming" && turn.body !== undefined && (
                        <AgentRippleText text={turn.body} active />
                      )}
                      {turn.status === "complete" && turn.parts && turn.parts.length > 0 ? (
                        <AgentAnswerView
                          parts={turn.parts}
                          onCommitActivate={onCommitActivate}
                          onBranchActivate={onBranchActivate}
                        />
                      ) : turn.status === "complete" && turn.html ? (
                        <div
                          className={styles.md}
                          dangerouslySetInnerHTML={{ __html: turn.html }}
                        />
                      ) : null}
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
              ref={composerRef}
              className={styles.composerInput}
              rows={1}
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
            <Button
              type="submit"
              variant="ghost"
              className={styles.sendButton}
              disabled={busy || !draft.trim()}
              aria-label="Ask"
            >
              Ask
            </Button>
          </div>
        </form>
        <div className={styles.snapshotBar} aria-label="Graph context">
          <p className={styles.snapshotRepo} title={`${owner}/${repo}`}>
            {owner}/{repo}
          </p>
          {/* Always mount the facts row so focus/inspect arrival does not grow the footer. */}
          <ul
            className={styles.snapshotFacts}
            data-empty={!focusedBranch && !selectedSha ? "true" : undefined}
            aria-hidden={!focusedBranch && !selectedSha}
          >
            {focusedBranch ? (
              <li className={styles.snapshotFact}>
                <span className={styles.snapshotLabel}>focused</span>
                <span className={styles.snapshotHandle} title={focusedBranch.name}>
                  {focusedBranch.name}
                </span>
              </li>
            ) : null}
            {selectedSha ? (
              <li className={styles.snapshotFact}>
                <span className={styles.snapshotLabel}>inspect</span>
                <span className={styles.snapshotHandle} title={selectedSha}>
                  {selectedSha.slice(0, 7)}
                </span>
              </li>
            ) : null}
          </ul>
        </div>
      </footer>
    </Surface>
  );
}
