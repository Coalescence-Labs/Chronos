import { parseRepoInput } from "@/lib/ingest/github/parse";

/**
 * Signed-in home library (COA-151): recently opened and pinned repos, kept in
 * this browser's localStorage only. Nothing here touches the network,
 * analytics or a URL we emit (docs/PRIVACY.md).
 *
 * The stored document belongs to one signed-in user. `adoptUser` creates it
 * (which is what enables recording), resets it when a different user signs in
 * on the same device, and `clearAll` removes it on sign-out. Signed-out
 * visitors never have a document, so `recordVisit` is a no-op for them.
 */

export const REPOS_STORAGE_KEY = "chronos:repos:v1";
export const REPOS_CHANGE_EVENT = "chronos:repos:change";
export const MAX_RECENT_REPOS = 12;
export const MAX_PINNED_REPOS = 24;

export interface SavedRepo {
  owner: string;
  repo: string;
  lastViewedAt: number;
  pinned: boolean;
}

export interface RepoLibrary {
  pinned: SavedRepo[];
  recent: SavedRepo[];
}

export type RepoStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

interface RepoDocument {
  v: 1;
  user: string;
  repos: SavedRepo[];
}

export function repoKey(owner: string, repo: string): string {
  return `${owner}/${repo}`.toLowerCase();
}

export function browserRepoStorage(): RepoStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function validRepoName(owner: unknown, repo: unknown): owner is string {
  if (typeof owner !== "string" || typeof repo !== "string") return false;
  try {
    const parsed = parseRepoInput(`${owner}/${repo}`);
    return parsed.owner === owner && parsed.repo === repo;
  } catch {
    return false;
  }
}

function parseRepo(value: unknown): SavedRepo | null {
  if (typeof value !== "object" || value === null) return null;
  const { owner, repo, lastViewedAt, pinned } = value as Record<string, unknown>;
  if (!validRepoName(owner, repo)) return null;
  if (typeof lastViewedAt !== "number" || !Number.isFinite(lastViewedAt)) return null;
  return { owner, repo: repo as string, lastViewedAt, pinned: pinned === true };
}

/** Tolerant parse: corrupt JSON or hostile shapes yield `null` / dropped rows, never a throw. */
export function parseRepoDocument(raw: string | null): RepoDocument | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const { v, user, repos } = data as Record<string, unknown>;
  if (v !== 1 || typeof user !== "string" || user.length === 0 || !Array.isArray(repos)) {
    return null;
  }
  const seen = new Set<string>();
  const clean: SavedRepo[] = [];
  for (const entry of repos) {
    const repo = parseRepo(entry);
    if (!repo) continue;
    const key = repoKey(repo.owner, repo.repo);
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push(repo);
  }
  return { v: 1, user, repos: clean };
}

/** Pinned and recent groups for `userId`, newest first. Empty unless the document is theirs. */
export function selectLibrary(raw: string | null, userId: string): RepoLibrary | null {
  const doc = parseRepoDocument(raw);
  if (!doc || doc.user !== userId) return null;
  const byRecency = (a: SavedRepo, b: SavedRepo) => b.lastViewedAt - a.lastViewedAt;
  return {
    pinned: doc.repos.filter((item) => item.pinned).sort(byRecency),
    recent: doc.repos.filter((item) => !item.pinned).sort(byRecency),
  };
}

function readRaw(storage: RepoStorage): string | null {
  try {
    return storage.getItem(REPOS_STORAGE_KEY);
  } catch {
    return null;
  }
}

function emitChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(REPOS_CHANGE_EVENT));
}

function write(storage: RepoStorage, doc: RepoDocument): boolean {
  try {
    storage.setItem(REPOS_STORAGE_KEY, JSON.stringify(doc));
  } catch {
    return false; // private mode / quota: the library is a convenience, not state
  }
  emitChange();
  return true;
}

/** Keep every pin; keep only the newest MAX_RECENT_REPOS unpinned entries. */
function enforceCaps(repos: SavedRepo[]): SavedRepo[] {
  const keep = new Set(
    repos
      .filter((item) => !item.pinned)
      .sort((a, b) => b.lastViewedAt - a.lastViewedAt)
      .slice(0, MAX_RECENT_REPOS)
      .map((item) => repoKey(item.owner, item.repo)),
  );
  return repos.filter((item) => item.pinned || keep.has(repoKey(item.owner, item.repo)));
}

/** Signed-in user this page load has confirmed; the UI shows nothing until it is set. */
let adoptedUser: string | null = null;

export function getAdoptedUser(): string | null {
  return adoptedUser;
}

/**
 * A visit that finished before the header confirmed who is signed in (a direct
 * load of a repo link). Held in memory only; flushed if a user is adopted.
 */
let pendingVisit: { owner: string; repo: string; at: number } | null = null;

/** Enable the library for `userId`, resetting it if it belonged to someone else. */
export function adoptUser(storage: RepoStorage, userId: string): void {
  if (!userId) return;
  const doc = parseRepoDocument(readRaw(storage));
  if (doc?.user !== userId) write(storage, { v: 1, user: userId, repos: [] });
  adoptedUser = userId;
  const pending = pendingVisit;
  pendingVisit = null;
  if (pending) recordVisit(storage, pending.owner, pending.repo, pending.at);
  emitChange();
}

/**
 * Report a successful repo view. Recorded now if a user is confirmed on this
 * page, otherwise held until one is — a signed-out visitor never gets recorded.
 */
export function noteVisit(storage: RepoStorage, owner: string, repo: string, now: number): void {
  if (adoptedUser) recordVisit(storage, owner, repo, now);
  else if (validRepoName(owner, repo)) pendingVisit = { owner, repo, at: now };
}

/** Record a view for the confirmed user. No-op unless the stored list is theirs. */
export function recordVisit(storage: RepoStorage, owner: string, repo: string, now: number): boolean {
  if (!validRepoName(owner, repo)) return false;
  const doc = parseRepoDocument(readRaw(storage));
  if (!doc || adoptedUser === null || doc.user !== adoptedUser) return false;
  const key = repoKey(owner, repo);
  const existing = doc.repos.find((item) => repoKey(item.owner, item.repo) === key);
  const repos = existing
    ? doc.repos.map((item) => (item === existing ? { ...item, lastViewedAt: now } : item))
    : [...doc.repos, { owner, repo, lastViewedAt: now, pinned: false }];
  return write(storage, { ...doc, repos: enforceCaps(repos) });
}

/** Flip a saved repo's pin. Returns false when it isn't saved or the pin cap is reached. */
export function togglePin(storage: RepoStorage, owner: string, repo: string): boolean {
  const doc = parseRepoDocument(readRaw(storage));
  if (!doc) return false;
  const key = repoKey(owner, repo);
  const target = doc.repos.find((item) => repoKey(item.owner, item.repo) === key);
  if (!target) return false;
  if (!target.pinned && doc.repos.filter((item) => item.pinned).length >= MAX_PINNED_REPOS) {
    return false;
  }
  const repos = doc.repos.map((item) => (item === target ? { ...item, pinned: !item.pinned } : item));
  return write(storage, { ...doc, repos: enforceCaps(repos) });
}

/** Forget unpinned repos; pins stay. */
export function clearRecents(storage: RepoStorage): boolean {
  const doc = parseRepoDocument(readRaw(storage));
  if (!doc) return false;
  return write(storage, { ...doc, repos: doc.repos.filter((item) => item.pinned) });
}

/** Remove the whole document (sign-out). */
export function clearAll(storage: RepoStorage): void {
  adoptedUser = null;
  pendingVisit = null;
  try {
    storage.removeItem(REPOS_STORAGE_KEY);
  } catch {
    // Nothing more to do: an unreadable store cannot be cleared.
  }
  emitChange();
}

/** Same name as CACHE in public/sw.js. */
const SHELL_CACHE = "chronos-shell-v2";

/**
 * Sign-out cleanup shared by every sign-out control: drop the library and the
 * service worker's cached signed-in shell so neither outlives the session.
 */
export async function forgetRepoLibrary(): Promise<void> {
  const storage = browserRepoStorage();
  if (storage) clearAll(storage);
  try {
    if (typeof caches !== "undefined") {
      await (await caches.open(SHELL_CACHE)).delete("/");
    }
  } catch {
    // Cache Storage can be unavailable; the library itself is already gone.
  }
}
