/** Client ↔ server graph context attached to Agent turns (loaded graph only). */

export const CHRONOS_AGENT_CONTEXT_MIME = "application/x-chronos-agent-context+json";

export type AgentChatContextKind = "commit" | "branch";

export interface AgentChatContextRef {
  kind: AgentChatContextKind;
  sha: string;
  label: string;
  /** First-line subject when kind is commit. */
  message?: string;
}

export interface AgentBranchFocus {
  name: string;
  tipSha: string;
}

export function serializeAgentContextRef(ref: AgentChatContextRef): string {
  return JSON.stringify(ref);
}

export function parseAgentContextRef(raw: string): AgentChatContextRef | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    const kind = record.kind;
    if (kind !== "commit" && kind !== "branch") return null;
    if (typeof record.sha !== "string" || typeof record.label !== "string") return null;
    const ref: AgentChatContextRef = {
      kind,
      sha: record.sha,
      label: record.label,
    };
    if (typeof record.message === "string") ref.message = record.message;
    return ref;
  } catch {
    return null;
  }
}

export function parseAgentContextDrop(dataTransfer: DataTransfer): AgentChatContextRef | null {
  const raw = dataTransfer.getData(CHRONOS_AGENT_CONTEXT_MIME);
  if (raw) {
    const parsed = parseAgentContextRef(raw);
    if (parsed) return parsed;
  }
  const plain = dataTransfer.getData("text/plain").trim();
  if (!plain) return null;
  return parseAgentContextRef(plain);
}

export function setAgentContextDragData(
  dataTransfer: DataTransfer,
  ref: AgentChatContextRef,
): void {
  const payload = serializeAgentContextRef(ref);
  dataTransfer.setData(CHRONOS_AGENT_CONTEXT_MIME, payload);
  dataTransfer.setData("text/plain", payload);
  dataTransfer.effectAllowed = "copy";
}

const MAX_CONTEXT_REFS = 8;

export function mergeContextRefs(
  existing: AgentChatContextRef[],
  incoming: AgentChatContextRef[],
): AgentChatContextRef[] {
  const key = (ref: AgentChatContextRef) => `${ref.kind}:${ref.sha}:${ref.label}`;
  const seen = new Map<string, AgentChatContextRef>();
  for (const ref of [...existing, ...incoming]) seen.set(key(ref), ref);
  return [...seen.values()].slice(0, MAX_CONTEXT_REFS);
}

/** Prefer explicit commit chips, then inspector selection, then traced branch tip. */
export function resolveAgentAnchorSha(input: {
  selectedSha?: string | null;
  contextRefs?: AgentChatContextRef[];
  focusedBranch?: AgentBranchFocus | null;
}): string | null {
  const chip = input.contextRefs?.find((ref) => ref.kind === "commit");
  if (chip) return chip.sha;
  if (input.selectedSha) return input.selectedSha;
  if (input.focusedBranch?.tipSha) return input.focusedBranch.tipSha;
  return null;
}

export function agentTurnContextPayload(input: {
  focusedBranch?: AgentBranchFocus | null;
  contextRefs?: AgentChatContextRef[];
}): { focusedBranch: AgentBranchFocus | null; contextRefs: AgentChatContextRef[] } {
  const contextRefs = (input.contextRefs ?? []).slice(0, MAX_CONTEXT_REFS);
  const focusedBranch =
    input.focusedBranch &&
    typeof input.focusedBranch.name === "string" &&
    typeof input.focusedBranch.tipSha === "string"
      ? input.focusedBranch
      : null;
  return { focusedBranch, contextRefs };
}
