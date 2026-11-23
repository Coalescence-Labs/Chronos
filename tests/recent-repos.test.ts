import { beforeEach, describe, expect, test } from "bun:test";
import {
  adoptUser,
  clearAll,
  clearRecents,
  MAX_PINNED_REPOS,
  MAX_RECENT_REPOS,
  parseRepoDocument,
  recordVisit,
  REPOS_STORAGE_KEY,
  selectLibrary,
  togglePin,
  type RepoStorage,
} from "@/lib/recent-repos";

function memoryStorage(initial: Record<string, string> = {}): RepoStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const raw = (storage: ReturnType<typeof memoryStorage>) => storage.data.get(REPOS_STORAGE_KEY) ?? null;
const library = (storage: ReturnType<typeof memoryStorage>, user = "u1") =>
  selectLibrary(raw(storage), user);

describe("recent repos store", () => {
  let storage: ReturnType<typeof memoryStorage>;
  beforeEach(() => {
    storage = memoryStorage();
  });

  test("records nothing until a signed-in user adopts the device", () => {
    expect(recordVisit(storage, "octocat", "Hello-World", 1)).toBe(false);
    expect(raw(storage)).toBeNull();
  });

  test("records a visit and refreshes it instead of duplicating, ignoring case", () => {
    adoptUser(storage, "u1");
    recordVisit(storage, "octocat", "Hello-World", 1);
    recordVisit(storage, "OctoCat", "hello-world", 5);
    const { recent } = library(storage)!;
    expect(recent).toEqual([{ owner: "octocat", repo: "Hello-World", lastViewedAt: 5, pinned: false }]);
  });

  test("lists newest first and caps unpinned entries by recency", () => {
    adoptUser(storage, "u1");
    for (let i = 0; i < MAX_RECENT_REPOS + 3; i++) recordVisit(storage, "o", `r${i}`, i);
    const { recent } = library(storage)!;
    expect(recent).toHaveLength(MAX_RECENT_REPOS);
    expect(recent[0]!.repo).toBe(`r${MAX_RECENT_REPOS + 2}`);
    expect(recent.at(-1)!.repo).toBe("r3");
  });

  test("pins survive eviction and sort into their own group", () => {
    adoptUser(storage, "u1");
    recordVisit(storage, "o", "keep", 0);
    expect(togglePin(storage, "o", "keep")).toBe(true);
    for (let i = 1; i <= MAX_RECENT_REPOS + 5; i++) recordVisit(storage, "o", `r${i}`, i);
    const lib = library(storage)!;
    expect(lib.pinned.map((item) => item.repo)).toEqual(["keep"]);
    expect(lib.recent).toHaveLength(MAX_RECENT_REPOS);
  });

  test("unpinning returns the repo to recents; unknown repos are not pinnable", () => {
    adoptUser(storage, "u1");
    recordVisit(storage, "o", "r", 1);
    togglePin(storage, "o", "r");
    togglePin(storage, "o", "r");
    expect(library(storage)!.pinned).toHaveLength(0);
    expect(library(storage)!.recent).toHaveLength(1);
    expect(togglePin(storage, "o", "missing")).toBe(false);
  });

  test("refuses pins past the cap", () => {
    adoptUser(storage, "u1");
    for (let i = 0; i < MAX_PINNED_REPOS + 1; i++) {
      recordVisit(storage, "o", `r${i}`, i);
      togglePin(storage, "o", `r${i}`);
    }
    expect(library(storage)!.pinned).toHaveLength(MAX_PINNED_REPOS);
  });

  test("clearRecents keeps pins; clearAll removes the document and stops recording", () => {
    adoptUser(storage, "u1");
    recordVisit(storage, "o", "a", 1);
    recordVisit(storage, "o", "b", 2);
    togglePin(storage, "o", "a");
    clearRecents(storage);
    expect(library(storage)).toEqual({
      pinned: [{ owner: "o", repo: "a", lastViewedAt: 1, pinned: true }],
      recent: [],
    });
    clearAll(storage);
    expect(raw(storage)).toBeNull();
    expect(recordVisit(storage, "o", "c", 3)).toBe(false);
  });

  test("a document belongs to one user: others see nothing and adopting resets it", () => {
    adoptUser(storage, "u1");
    recordVisit(storage, "o", "private-to-u1", 1);
    expect(selectLibrary(raw(storage), "u2")).toBeNull();
    adoptUser(storage, "u2");
    expect(library(storage, "u2")).toEqual({ pinned: [], recent: [] });
    expect(selectLibrary(raw(storage), "u1")).toBeNull();
  });

  test("adopting the same user keeps the list", () => {
    adoptUser(storage, "u1");
    recordVisit(storage, "o", "r", 1);
    adoptUser(storage, "u1");
    expect(library(storage)!.recent).toHaveLength(1);
  });

  test("rejects names that are not valid GitHub repos", () => {
    adoptUser(storage, "u1");
    expect(recordVisit(storage, "../etc", "passwd", 1)).toBe(false);
    expect(recordVisit(storage, "o", "r/../x", 1)).toBe(false);
    expect(recordVisit(storage, "o", "r.git", 1)).toBe(false);
    expect(library(storage)!.recent).toHaveLength(0);
  });

  test("tolerates corrupt storage: bad JSON, wrong shapes, hostile rows", () => {
    for (const bad of ["{not json", "null", "[]", '{"v":2}', '{"v":1,"user":"","repos":[]}', '{"v":1,"user":"u1","repos":"x"}']) {
      expect(parseRepoDocument(bad)).toBeNull();
    }
    const mixed = JSON.stringify({
      v: 1,
      user: "u1",
      repos: [
        { owner: "ok", repo: "one", lastViewedAt: 1, pinned: true },
        { owner: "ok", repo: "ONE", lastViewedAt: 9, pinned: false },
        { owner: "<script>", repo: "x", lastViewedAt: 1 },
        { owner: "ok", repo: "two", lastViewedAt: "yesterday" },
        { owner: "ok", repo: "three", lastViewedAt: null },
        "nope",
        null,
      ],
    });
    expect(parseRepoDocument(mixed)!.repos).toEqual([
      { owner: "ok", repo: "one", lastViewedAt: 1, pinned: true },
    ]);
  });

  test("survives storage that throws (private mode / quota)", () => {
    const throwing: RepoStorage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    expect(() => adoptUser(throwing, "u1")).not.toThrow();
    expect(recordVisit(throwing, "o", "r", 1)).toBe(false);
    expect(togglePin(throwing, "o", "r")).toBe(false);
    expect(() => clearAll(throwing)).not.toThrow();
  });
});
