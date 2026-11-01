import type { RepoHistory } from "@/lib/graph";
import {
  buildStarterHistoryFingerprint,
  starterDayKey,
} from "./fingerprint";
import { parseStartersPayload, type AgentStarter } from "./schema";

/**
 * Reserved empty-state chip slots (schema max = 4). Skeletons and ready/fallback
 * paints share this footprint so 2↔3↔4 swaps do not shift the panel.
 */
export const STARTER_SLOT_COUNT = 4;
/** Alias — same reserved slot count used while starters load. */
export const STARTER_SKELETON_COUNT = STARTER_SLOT_COUNT;

const CACHE_PREFIX = "chronos:agent-starters:v1:";

export type ClientStarterCacheEntry = {
  starters: AgentStarter[];
  /** Server snapshotHash when known — confirmation only; not required to paint. */
  snapshotHash?: string;
  dayKey: string;
};

type StarterStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

let storageOverride: StarterStorage | null = null;

/** Test helper — inject memory storage (or null to restore). */
export function setClientStarterStorageForTests(storage: StarterStorage | null): void {
  storageOverride = storage;
}

function getStorage(): StarterStorage | null {
  if (storageOverride) return storageOverride;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Sync FNV-1a hex — keeps localStorage keys short without node:crypto. */
export function hashClientStarterMaterial(material: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < material.length; i++) {
    hash ^= material.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Browser-local cache key (no WorkOS id — UX only).
 * Material: owner/repo + UTC day + history fingerprint (tips|count|default).
 * Values are chip labels/prompts only — never tokens, SHAs, or messages.
 */
export function clientStarterCacheKey(input: {
  owner: string;
  repo: string;
  history: RepoHistory;
  defaultBranch?: string;
  now?: Date;
}): string {
  const fingerprint = buildStarterHistoryFingerprint(input.history, input.defaultBranch);
  const dayKey = starterDayKey(input.now);
  const material = [
    `${input.owner.trim()}/${input.repo.trim()}`,
    dayKey,
    fingerprint,
  ].join("\0");
  return `${CACHE_PREFIX}${hashClientStarterMaterial(material)}`;
}

export function readClientStarterCache(input: {
  owner: string;
  repo: string;
  history: RepoHistory;
  defaultBranch?: string;
  now?: Date;
}): ClientStarterCacheEntry | null {
  const storage = getStorage();
  if (!storage) return null;
  const key = clientStarterCacheKey(input);
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    const payload = parseStartersPayload({ starters: record.starters });
    if (!payload) return null;
    const dayKey =
      typeof record.dayKey === "string" ? record.dayKey : starterDayKey(input.now);
    if (dayKey !== starterDayKey(input.now)) {
      storage.removeItem(key);
      return null;
    }
    const snapshotHash =
      typeof record.snapshotHash === "string" ? record.snapshotHash : undefined;
    return { starters: payload.starters, snapshotHash, dayKey };
  } catch {
    return null;
  }
}

export function writeClientStarterCache(
  input: {
    owner: string;
    repo: string;
    history: RepoHistory;
    defaultBranch?: string;
    now?: Date;
  },
  starters: AgentStarter[],
  snapshotHash?: string,
): void {
  const storage = getStorage();
  if (!storage) return;
  const payload = parseStartersPayload({ starters });
  if (!payload) return;
  const key = clientStarterCacheKey(input);
  const entry: ClientStarterCacheEntry = {
    starters: payload.starters,
    dayKey: starterDayKey(input.now),
    ...(snapshotHash ? { snapshotHash } : {}),
  };
  try {
    storage.setItem(key, JSON.stringify(entry));
  } catch {
    // Quota / private mode — fail open (skeletons / network path).
  }
}

export function clearClientStarterCache(input: {
  owner: string;
  repo: string;
  history: RepoHistory;
  defaultBranch?: string;
  now?: Date;
}): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(clientStarterCacheKey(input));
  } catch {
    // ignore
  }
}
