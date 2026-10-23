"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type {
  AgentBranchPart,
  AgentCommitPart,
  AgentDatePart,
  AgentGenUiInlinePart,
  AgentListPart,
  AgentParentsPart,
  AgentReleaseNotePart,
  AgentTagPart,
  AgentTextPart,
} from "@/lib/agent/gen-ui";
import styles from "./gen-ui.module.css";

export interface AgentGenUiActions {
  onCommitActivate?: (sha: string) => void;
  onBranchActivate?: (name: string, tipSha?: string) => void;
}

const LONG_PRESS_MS = 480;

function CommitHashPrimitive({
  part,
  onCommitActivate,
}: {
  part: AgentCommitPart;
  onCommitActivate?: (sha: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef(0);
  const pressTimer = useRef(0);
  const longPressed = useRef(false);
  useEffect(
    () => () => {
      clearTimeout(copyTimer.current);
      clearTimeout(pressTimer.current);
    },
    [],
  );

  const label = part.label ?? part.sha.slice(0, 7);
  const title = `${part.sha} — long-press to copy`;

  const copySha = async () => {
    try {
      await navigator.clipboard?.writeText(part.sha);
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard may be unavailable.
    }
  };

  const clearPress = () => {
    clearTimeout(pressTimer.current);
    pressTimer.current = 0;
  };

  return (
    <button
      type="button"
      className={styles.commit}
      data-copied={copied || undefined}
      title={title}
      aria-label={`Commit ${label}${copied ? ", copied" : ""}`}
      onPointerDown={() => {
        longPressed.current = false;
        clearPress();
        pressTimer.current = window.setTimeout(() => {
          longPressed.current = true;
          void copySha();
        }, LONG_PRESS_MS);
      }}
      onPointerUp={clearPress}
      onPointerLeave={clearPress}
      onPointerCancel={clearPress}
      onClick={() => {
        if (longPressed.current) {
          longPressed.current = false;
          return;
        }
        onCommitActivate?.(part.sha);
      }}
    >
      {label}
    </button>
  );
}

function BranchPrimitive({
  part,
  onBranchActivate,
}: {
  part: AgentBranchPart;
  onBranchActivate?: (name: string, tipSha?: string) => void;
}) {
  return (
    <button
      type="button"
      className={styles.ref}
      data-kind="branch"
      title={part.tipSha ? `${part.name} @ ${part.tipSha.slice(0, 7)}` : part.name}
      aria-label={`Branch ${part.name}`}
      onClick={() => onBranchActivate?.(part.name, part.tipSha)}
    >
      {part.name}
    </button>
  );
}

function TagPrimitive({
  part,
  onCommitActivate,
}: {
  part: AgentTagPart;
  onCommitActivate?: (sha: string) => void;
}) {
  if (part.sha && onCommitActivate) {
    return (
      <button
        type="button"
        className={styles.ref}
        data-kind="tag"
        title={part.sha}
        aria-label={`Tag ${part.name}`}
        onClick={() => onCommitActivate(part.sha!)}
      >
        {part.name}
      </button>
    );
  }
  return (
    <span className={styles.ref} data-kind="tag" title={part.sha ?? part.name}>
      {part.name}
    </span>
  );
}

function DatePrimitive({ part }: { part: AgentDatePart }) {
  const label =
    part.label ??
    (part.iso
      ? (() => {
          const parsed = Date.parse(part.iso);
          return Number.isFinite(parsed)
            ? new Date(parsed).toISOString().slice(0, 10)
            : part.iso.slice(0, 10);
        })()
      : "");
  if (!label) return null;
  return (
    <time className={styles.date} dateTime={part.iso ?? undefined}>
      {label}
    </time>
  );
}

function TextPrimitive({ part }: { part: AgentTextPart }) {
  return <span className={styles.run}>{part.text}</span>;
}

function ParentsPrimitive({
  part,
  onCommitActivate,
}: {
  part: AgentParentsPart;
  onCommitActivate?: (sha: string) => void;
}) {
  return (
    <span className={styles.parents}>
      <span className={styles.parentsLabel}>parents</span>
      {part.shas.map((sha) => (
        <CommitHashPrimitive
          key={sha}
          part={{ type: "commit", sha, label: sha.slice(0, 7) }}
          onCommitActivate={onCommitActivate}
        />
      ))}
    </span>
  );
}

function ReleaseNotePrimitive({ part }: { part: AgentReleaseNotePart }) {
  return (
    <aside className={styles.release}>
      <p className={styles.releaseTitle}>{part.title}</p>
      {part.body ? <p className={styles.releaseBody}>{part.body}</p> : null}
    </aside>
  );
}

function renderInline(part: AgentGenUiInlinePart, actions: AgentGenUiActions, key: string): ReactNode {
  switch (part.type) {
    case "text":
      return <TextPrimitive key={key} part={part} />;
    case "commit":
      return (
        <CommitHashPrimitive key={key} part={part} onCommitActivate={actions.onCommitActivate} />
      );
    case "branch":
      return (
        <BranchPrimitive key={key} part={part} onBranchActivate={actions.onBranchActivate} />
      );
    case "tag":
      return (
        <TagPrimitive key={key} part={part} onCommitActivate={actions.onCommitActivate} />
      );
    case "date":
      return <DatePrimitive key={key} part={part} />;
    case "parents":
      return (
        <ParentsPrimitive key={key} part={part} onCommitActivate={actions.onCommitActivate} />
      );
    default:
      return null;
  }
}

function ListPrimitive({
  part,
  actions,
}: {
  part: AgentListPart;
  actions: AgentGenUiActions;
}) {
  return (
    <ul className={styles.list}>
      {part.items.map((item, index) => (
        <li key={`li-${index}`} className={styles.listItem}>
          {item.map((cell, cellIndex) => renderInline(cell, actions, `c-${index}-${cellIndex}`))}
        </li>
      ))}
    </ul>
  );
}

export const agentGenUiRegistry = {
  text: TextPrimitive,
  commit: CommitHashPrimitive,
  branch: BranchPrimitive,
  tag: TagPrimitive,
  date: DatePrimitive,
  parents: ParentsPrimitive,
  release_note: ReleaseNotePrimitive,
  list: ListPrimitive,
} as const;

export function renderAgentGenUiPart(
  part: import("@/lib/agent/gen-ui").AgentGenUiPart,
  actions: AgentGenUiActions,
  key: string,
): ReactNode {
  switch (part.type) {
    case "list":
      return <ListPrimitive key={key} part={part} actions={actions} />;
    case "release_note":
      return <ReleaseNotePrimitive key={key} part={part} />;
    case "text":
      return (
        <p key={key} className={styles.block}>
          <TextPrimitive part={part} />
        </p>
      );
    default:
      return (
        <p key={key} className={styles.block}>
          {renderInline(part, actions, `${key}-inline`)}
        </p>
      );
  }
}
