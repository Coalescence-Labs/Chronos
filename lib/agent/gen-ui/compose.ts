import type { RepoHistory } from "@/lib/graph";
import { parseAgentGenUiPayload, sanitizeAgentGenUiParts } from "./sanitize";
import type { AgentGenUiInlinePart, AgentGenUiPart } from "./types";

const PARTS_FENCE_RE = /```(?:chronos-parts|json)\s*([\s\S]*?)```/i;
const BACKTICK_RE = /`([^`\n]+)`/g;
const BARE_SHA_RE = /\b([0-9a-f]{7,40})\b/gi;
const ISO_DATE_RE = /\b(\d{4}-\d{2}-\d{2})\b/g;

function indexHistory(history?: RepoHistory | null): {
  shaPrefix: Map<string, string>;
  branches: Map<string, string>;
  tags: Map<string, string>;
} {
  const shaPrefix = new Map<string, string>();
  const branches = new Map<string, string>();
  const tags = new Map<string, string>();
  if (!history) return { shaPrefix, branches, tags };

  for (const commit of history.commits) {
    const full = commit.sha.toLowerCase();
    shaPrefix.set(full, full);
    for (let len = 7; len <= Math.min(12, full.length); len++) {
      const prefix = full.slice(0, len);
      if (!shaPrefix.has(prefix)) shaPrefix.set(prefix, full);
    }
  }
  for (const ref of history.refs) {
    if (ref.type === "branch") branches.set(ref.name.toLowerCase(), ref.sha.toLowerCase());
    if (ref.type === "tag") tags.set(ref.name.toLowerCase(), ref.sha.toLowerCase());
  }
  return { shaPrefix, branches, tags };
}

function resolveToken(
  token: string,
  index: ReturnType<typeof indexHistory>,
): AgentGenUiInlinePart | null {
  const trimmed = token.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  const fullSha = index.shaPrefix.get(lower);
  if (fullSha) {
    return { type: "commit", sha: fullSha, label: fullSha.slice(0, 7) };
  }
  const tipSha = index.branches.get(lower);
  if (tipSha) {
    return { type: "branch", name: trimmed, tipSha };
  }
  // Also match branch names that appear without being in refs (feature/… in prose).
  if (/^(?:feature|bugfix|hotfix|release|chore|docs|perf|refactor|test|ci)\/[\w./+-]+$/i.test(trimmed)) {
    return { type: "branch", name: trimmed };
  }
  const tagSha = index.tags.get(lower);
  if (tagSha) {
    return { type: "tag", name: trimmed, sha: tagSha };
  }
  if (/^v?\d+\.\d+(?:\.\d+)?(?:-[\w.]+)?$/i.test(trimmed) && trimmed.length <= 32) {
    return { type: "tag", name: trimmed };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { type: "date", iso: trimmed, label: trimmed };
  }
  return null;
}

/** Split a prose line into text + typed inline parts using backticks + history. */
export function tokenizeInlineLine(
  line: string,
  history?: RepoHistory | null,
): AgentGenUiInlinePart[] {
  const index = indexHistory(history);
  const parts: AgentGenUiInlinePart[] = [];
  let cursor = 0;
  const source = line.slice(0, 800);

  const pushText = (text: string) => {
    const cleaned = text.replace(/\s+/g, " ");
    if (!cleaned.trim()) return;
    // Further lift bare SHAs / dates inside remaining prose.
    let local = 0;
    const combined = new RegExp(`${BARE_SHA_RE.source}|${ISO_DATE_RE.source}`, "gi");
    let match: RegExpExecArray | null;
    while ((match = combined.exec(cleaned)) !== null) {
      if (match.index > local) {
        parts.push({ type: "text", text: cleaned.slice(local, match.index) });
      }
      const token = match[0];
      const resolved = resolveToken(token, index);
      parts.push(resolved ?? { type: "text", text: token });
      local = match.index + token.length;
    }
    if (local < cleaned.length) {
      parts.push({ type: "text", text: cleaned.slice(local) });
    }
  };

  BACKTICK_RE.lastIndex = 0;
  let tick: RegExpExecArray | null;
  while ((tick = BACKTICK_RE.exec(source)) !== null) {
    if (tick.index > cursor) pushText(source.slice(cursor, tick.index));
    const inner = tick[1] ?? "";
    const resolved = resolveToken(inner, index);
    parts.push(resolved ?? { type: "text", text: inner });
    cursor = tick.index + tick[0].length;
  }
  if (cursor < source.length) pushText(source.slice(cursor));

  return quietRefAdjacentShas(mergeAdjacentText(parts));
}

function mergeAdjacentText(parts: AgentGenUiInlinePart[]): AgentGenUiInlinePart[] {
  const out: AgentGenUiInlinePart[] = [];
  for (const part of parts) {
    const prev = out[out.length - 1];
    if (part.type === "text" && prev?.type === "text") {
      prev.text += part.text;
    } else {
      out.push(part.type === "text" ? { ...part } : part);
    }
  }
  return out.filter((part) => part.type !== "text" || part.text.trim().length > 0);
}

/** Text that is only punctuation / middots wrapping a dropped tip SHA. */
const ORPHAN_SEP_RE = /^[\s·•.,;:()[\]{}<>\-–—|/\\]+$/u;

function shaPrefixesMatch(a: string, b: string): boolean {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  const n = Math.min(left.length, right.length, 12);
  if (n < 7) return false;
  return left.slice(0, n) === right.slice(0, n);
}

function lastSignificant(parts: AgentGenUiInlinePart[]): AgentGenUiInlinePart | null {
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i]!;
    if (part.type === "text" && ORPHAN_SEP_RE.test(part.text)) continue;
    return part;
  }
  return null;
}

function trimTrailingSepText(parts: AgentGenUiInlinePart[]): void {
  while (parts.length > 0) {
    const last = parts[parts.length - 1]!;
    if (last.type !== "text") break;
    const trimmed = last.text.replace(/[\s·•.,;:()[\]{}<>\-–—|/\\]+$/u, "");
    if (trimmed.length === 0) {
      parts.pop();
      continue;
    }
    if (trimmed !== last.text) last.text = trimmed;
    break;
  }
}

/**
 * Refs/branches/tags are primary. Drop commit SHAs that only decorate a
 * preceding ref (list rows like `feature/x` · `abc1234`, or `develop (37de000)`).
 * Tip SHAs that match a branch/tag in the same inline run are always dropped.
 */
export function quietRefAdjacentShas(parts: AgentGenUiInlinePart[]): AgentGenUiInlinePart[] {
  const tipKeys = new Set<string>();
  for (const part of parts) {
    if (part.type === "branch" && part.tipSha) tipKeys.add(part.tipSha.toLowerCase());
    if (part.type === "tag" && part.sha) tipKeys.add(part.sha.toLowerCase());
  }

  const out: AgentGenUiInlinePart[] = [];
  for (const part of parts) {
    if (part.type === "commit") {
      const sha = part.sha.toLowerCase();
      const matchesTip = [...tipKeys].some((tip) => shaPrefixesMatch(sha, tip));
      const prev = lastSignificant(out);
      const afterRef = prev?.type === "branch" || prev?.type === "tag";
      if (matchesTip || afterRef) {
        trimTrailingSepText(out);
        continue;
      }
    }
    out.push(part.type === "text" ? { ...part } : part);
  }

  return mergeAdjacentText(
    out.filter((part) => part.type !== "text" || !ORPHAN_SEP_RE.test(part.text)),
  );
}

function quietAnswerTree(parts: AgentGenUiPart[]): AgentGenUiPart[] {
  return parts.flatMap((part) => {
    if (part.type === "list") {
      return [
        {
          type: "list" as const,
          items: part.items
            .map((item) => quietRefAdjacentShas(item))
            .filter((item) => item.length > 0),
        },
      ];
    }
    if (part.type === "release_note" || part.type === "parents") return [part];
    // Block-level single inlines stay as-is unless we re-batch — callers quiet
    // full inline runs via tokenizeInlineLine / quietRefAdjacentShas first.
    return [part];
  });
}

function isBulletLine(line: string): boolean {
  return /^\s*[-*•]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line);
}

function stripBullet(line: string): string {
  return line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim();
}

/**
 * Lift markdown (or a chronos-parts JSON fence) into a sanitized part sequence.
 * Prefer an explicit fence when the model/orchestrator emits one; otherwise
 * compose from bullets + backtick entities grounded in loaded history.
 */
export function composeAgentAnswerParts(
  text: string,
  history?: RepoHistory | null,
): AgentGenUiPart[] {
  const normalized = text.replace(/\r\n/g, "\n").trim().slice(0, 12_000);
  if (!normalized) return [];

  const fence = PARTS_FENCE_RE.exec(normalized);
  if (fence?.[1]) {
    try {
      const parsed = JSON.parse(fence[1].trim()) as unknown;
      const parts = parseAgentGenUiPayload(parsed);
      if (parts.length > 0) return quietAnswerTree(parts);
    } catch {
      // Fall through to markdown lift.
    }
  }

  // Whole-body JSON (orchestrator structured path).
  if (normalized.startsWith("{") || normalized.startsWith("[")) {
    try {
      const parts = parseAgentGenUiPayload(JSON.parse(normalized) as unknown);
      if (parts.length > 0) return quietAnswerTree(parts);
    } catch {
      // Not JSON — continue.
    }
  }

  const lines = normalized.split("\n");
  const parts: AgentGenUiPart[] = [];
  let listBuffer: AgentGenUiInlinePart[][] = [];

  /** Keep under sanitize MAX_LIST_ITEMS (6): 5 bullets + optional overflow line. */
  const MAX_COMPOSE_LIST = 5;
  const MAX_COMPOSE_PROSE_BLOCKS = 4;

  const flushList = () => {
    if (listBuffer.length === 0) return;
    const items = listBuffer.slice(0, MAX_COMPOSE_LIST);
    if (listBuffer.length > MAX_COMPOSE_LIST) {
      items.push([{ type: "text", text: `+${listBuffer.length - MAX_COMPOSE_LIST} more` }]);
    }
    parts.push({ type: "list", items });
    listBuffer = [];
  };

  let proseBlocks = 0;
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      flushList();
      continue;
    }
    // Skip fenced code blocks in the markdown lift path.
    if (line.trim().startsWith("```")) {
      flushList();
      continue;
    }
    // Drop essay section headers like "Notes:" that waste dock height.
    if (/^(?:notes|summary|context|details|explanation)\s*:?\s*$/i.test(line.trim())) {
      flushList();
      continue;
    }
    if (isBulletLine(line)) {
      const inline = tokenizeInlineLine(stripBullet(line), history);
      if (inline.length > 0) listBuffer.push(inline);
      continue;
    }
    flushList();
    if (proseBlocks >= MAX_COMPOSE_PROSE_BLOCKS) continue;
    const inline = tokenizeInlineLine(line.replace(/^#{1,3}\s+/, ""), history);
    if (inline.length === 1) {
      parts.push(inline[0]!);
      proseBlocks += 1;
    } else if (inline.length > 1) {
      // Block prose with mixed entities → sequential inline parts.
      for (const piece of inline) parts.push(piece);
      proseBlocks += 1;
    }
  }
  flushList();

  return sanitizeAgentGenUiParts(quietAnswerTree(parts));
}
