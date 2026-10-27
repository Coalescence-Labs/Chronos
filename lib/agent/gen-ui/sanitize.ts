import type {
  AgentBranchPart,
  AgentCommitPart,
  AgentDatePart,
  AgentGenUiInlinePart,
  AgentGenUiPart,
  AgentListPart,
  AgentParentsPart,
  AgentReleaseNotePart,
  AgentTagPart,
  AgentTextPart,
} from "./types";

/** Dock-aware caps — answers must stay scannable in a ~360px column. */
const MAX_PARTS = 20;
const MAX_LIST_ITEMS = 6;
const MAX_INLINE_PER_ITEM = 8;
const MAX_TEXT = 280;
const MAX_LABEL = 120;
const MAX_SHA = 64;
const MAX_PARENTS = 8;

const SHA_RE = /^[0-9a-f]{7,64}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(?:[Tt ].*)?$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function cleanText(raw: unknown, max = MAX_TEXT): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.replace(/\0/g, "").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function cleanSha(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const sha = raw.trim().toLowerCase();
  if (!SHA_RE.test(sha)) return null;
  return sha.slice(0, MAX_SHA);
}

function cleanRefName(raw: unknown): string | null {
  const name = cleanText(raw, MAX_LABEL);
  if (!name) return null;
  // Reject path tricks / control chars; allow common git ref characters.
  if (/[\x00-\x1f\x7f]/.test(name)) return null;
  if (name.includes("..") || name.startsWith("/") || name.endsWith("/")) return null;
  return name;
}

function sanitizeText(raw: Record<string, unknown>): AgentTextPart | null {
  const text = cleanText(raw.text);
  if (!text) return null;
  return { type: "text", text };
}

function sanitizeCommit(raw: Record<string, unknown>): AgentCommitPart | null {
  const sha = cleanSha(raw.sha);
  if (!sha) return null;
  const label = cleanText(raw.label, 16) ?? undefined;
  return label ? { type: "commit", sha, label } : { type: "commit", sha };
}

function sanitizeBranch(raw: Record<string, unknown>): AgentBranchPart | null {
  const name = cleanRefName(raw.name);
  if (!name) return null;
  const tipSha = cleanSha(raw.tipSha) ?? undefined;
  return tipSha ? { type: "branch", name, tipSha } : { type: "branch", name };
}

function sanitizeTag(raw: Record<string, unknown>): AgentTagPart | null {
  const name = cleanRefName(raw.name);
  if (!name) return null;
  const sha = cleanSha(raw.sha) ?? undefined;
  return sha ? { type: "tag", name, sha } : { type: "tag", name };
}

function sanitizeReleaseNote(raw: Record<string, unknown>): AgentReleaseNotePart | null {
  const title = cleanText(raw.title, MAX_LABEL);
  if (!title) return null;
  const body = cleanText(raw.body, MAX_TEXT) ?? undefined;
  return body ? { type: "release_note", title, body } : { type: "release_note", title };
}

function sanitizeDate(raw: Record<string, unknown>): AgentDatePart | null {
  const isoRaw = typeof raw.iso === "string" ? raw.iso.trim() : "";
  const iso = isoRaw && ISO_DATE_RE.test(isoRaw) ? isoRaw.slice(0, 40) : undefined;
  const label = cleanText(raw.label, 40) ?? undefined;
  if (!iso && !label) return null;
  return {
    type: "date",
    ...(iso ? { iso } : {}),
    ...(label ? { label } : {}),
  };
}

function sanitizeParents(raw: Record<string, unknown>): AgentParentsPart | null {
  if (!Array.isArray(raw.shas)) return null;
  const shas: string[] = [];
  for (const item of raw.shas) {
    const sha = cleanSha(item);
    if (sha) shas.push(sha);
    if (shas.length >= MAX_PARENTS) break;
  }
  if (shas.length === 0) return null;
  return { type: "parents", shas };
}

function sanitizeInline(raw: unknown): AgentGenUiInlinePart | null {
  const record = asRecord(raw);
  if (!record || typeof record.type !== "string") return null;
  switch (record.type) {
    case "text":
      return sanitizeText(record);
    case "commit":
      return sanitizeCommit(record);
    case "branch":
      return sanitizeBranch(record);
    case "tag":
      return sanitizeTag(record);
    case "date":
      return sanitizeDate(record);
    case "parents":
      return sanitizeParents(record);
    default:
      return null;
  }
}

function sanitizeList(raw: Record<string, unknown>): AgentListPart | null {
  if (!Array.isArray(raw.items)) return null;
  const items: AgentGenUiInlinePart[][] = [];
  for (const item of raw.items) {
    if (!Array.isArray(item)) continue;
    const row: AgentGenUiInlinePart[] = [];
    for (const cell of item) {
      const part = sanitizeInline(cell);
      if (part) row.push(part);
      if (row.length >= MAX_INLINE_PER_ITEM) break;
    }
    if (row.length > 0) items.push(row);
    if (items.length >= MAX_LIST_ITEMS) break;
  }
  if (items.length === 0) return null;
  return { type: "list", items };
}

function sanitizePart(raw: unknown): AgentGenUiPart | null {
  const record = asRecord(raw);
  if (!record || typeof record.type !== "string") return null;
  switch (record.type) {
    case "list":
      return sanitizeList(record);
    case "release_note":
      return sanitizeReleaseNote(record);
    default:
      return sanitizeInline(raw);
  }
}

/**
 * Sanitize an untrusted structured answer payload into a typed part sequence.
 * Drops unknown types and malformed fields; never throws.
 */
export function sanitizeAgentGenUiParts(raw: unknown): AgentGenUiPart[] {
  if (!Array.isArray(raw)) return [];
  const parts: AgentGenUiPart[] = [];
  for (const item of raw) {
    const part = sanitizePart(item);
    if (part) parts.push(part);
    if (parts.length >= MAX_PARTS) break;
  }
  return parts;
}

/**
 * Parse a model/orchestrator JSON payload: either a bare parts array or
 * `{ "parts": [...] }`. Returns [] when the payload is not structured gen-UI.
 */
export function parseAgentGenUiPayload(raw: unknown): AgentGenUiPart[] {
  if (Array.isArray(raw)) return sanitizeAgentGenUiParts(raw);
  const record = asRecord(raw);
  if (!record) return [];
  return sanitizeAgentGenUiParts(record.parts);
}
