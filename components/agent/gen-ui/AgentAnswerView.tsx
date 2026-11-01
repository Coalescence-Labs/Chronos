"use client";

import type { ReactNode } from "react";
import type { AgentGenUiInlinePart, AgentGenUiPart } from "@/lib/agent/gen-ui";
import {
  agentGenUiRegistry,
  renderAgentGenUiPart,
  type AgentGenUiActions,
} from "./primitives";
import styles from "./gen-ui.module.css";

function isInlineOnly(part: AgentGenUiPart): part is AgentGenUiInlinePart {
  return part.type !== "list" && part.type !== "release_note";
}

function InlineRun({
  parts,
  actions,
  runKey,
}: {
  parts: readonly AgentGenUiInlinePart[];
  actions: AgentGenUiActions;
  runKey: string;
}) {
  const Text = agentGenUiRegistry.text;
  const Commit = agentGenUiRegistry.commit;
  const Branch = agentGenUiRegistry.branch;
  const Tag = agentGenUiRegistry.tag;
  const DatePart = agentGenUiRegistry.date;
  const Parents = agentGenUiRegistry.parents;

  return (
    <p className={styles.block}>
      {parts.map((part, index) => {
        const key = `${runKey}-${index}`;
        switch (part.type) {
          case "text":
            return <Text key={key} part={part} />;
          case "commit":
            return (
              <Commit key={key} part={part} onCommitActivate={actions.onCommitActivate} />
            );
          case "branch":
            return (
              <Branch key={key} part={part} onBranchActivate={actions.onBranchActivate} />
            );
          case "tag":
            return (
              <Tag key={key} part={part} onCommitActivate={actions.onCommitActivate} />
            );
          case "date":
            return <DatePart key={key} part={part} />;
          case "parents":
            return (
              <Parents key={key} part={part} onCommitActivate={actions.onCommitActivate} />
            );
          default:
            return null;
        }
      })}
    </p>
  );
}

/**
 * Renders a sanitized gen-UI part sequence via the Chronos Agent primitive registry.
 * Consecutive inline parts coalesce into one paragraph so prose + entities read as a run.
 */
export function AgentAnswerView({
  parts,
  onCommitActivate,
  onBranchActivate,
}: {
  parts: readonly AgentGenUiPart[];
  onCommitActivate?: (sha: string) => void;
  onBranchActivate?: (name: string, tipSha?: string) => void;
}) {
  const actions: AgentGenUiActions = { onCommitActivate, onBranchActivate };
  const nodes: ReactNode[] = [];
  let inlineBuffer: AgentGenUiInlinePart[] = [];
  let runIndex = 0;

  const flushInline = () => {
    if (inlineBuffer.length === 0) return;
    const id = runIndex++;
    nodes.push(
      <InlineRun key={`run-${id}`} runKey={`run-${id}`} parts={inlineBuffer} actions={actions} />,
    );
    inlineBuffer = [];
  };

  parts.forEach((part, index) => {
    if (isInlineOnly(part)) {
      inlineBuffer.push(part);
      return;
    }
    flushInline();
    nodes.push(renderAgentGenUiPart(part, actions, `block-${index}`));
  });
  flushInline();

  return <div className={styles.answer}>{nodes}</div>;
}

export { agentGenUiRegistry } from "./primitives";
