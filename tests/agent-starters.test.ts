import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  STARTER_INPUT_BUDGET_USD,
  HAIKU_INPUT_USD_PER_MTOK,
  STARTER_CHARS_PER_TOKEN,
  STARTER_MAX_INPUT_TOKENS,
  STARTER_MAX_INPUT_CHARS,
  MAX_STARTER_CONTEXT_CHARS,
  isWithinStarterInputBudget,
  clampStarterContextJson,
  buildStarterHistoryFingerprint,
  starterDayKey,
  buildStarterCacheMaterial,
  resolveStarterCacheKey,
  starterCacheKey,
  readStarterCache,
  writeStarterCache,
  clearStarterMemoryCache,
  staticAgentStarters,
  parseStartersPayload,
  agentStartersResponseSchema,
  STARTER_SLOT_COUNT,
  STARTER_SKELETON_COUNT,
  clientStarterCacheKey,
  hashClientStarterMaterial,
  readClientStarterCache,
  writeClientStarterCache,
  clearClientStarterCache,
  setClientStarterStorageForTests,
  paintFromLocalCache,
  paintFromStartersApi,
  paintFromStartersFetchFailure,
} from "@/lib/agent/starters";
import { linear } from "@/tests/fixtures/history";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}

describe("agent starters schema", () => {
  test("accepts well-formed starters with describes present on schema shape", () => {
    const parsed = agentStartersResponseSchema.safeParse({
      starters: [
        {
          id: "merges-main",
          label: "Recent merges into main?",
          prompt: "What are the recent merges into main?",
        },
        {
          id: "share-parent",
          label: "Branches that share a parent?",
          prompt: "Branches that share a parent?",
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  test("rejects empty or oversized payloads", () => {
    expect(parseStartersPayload({ starters: [] })).toBeNull();
    expect(
      parseStartersPayload({
        starters: [{ id: "", label: "x", prompt: "y" }],
      }),
    ).toBeNull();
  });
});

describe("agent starters budget", () => {
  test("documents $0.05 Haiku input math (50k tokens @ $1/MTok, 3 chars/token)", () => {
    expect(STARTER_INPUT_BUDGET_USD).toBe(0.05);
    expect(HAIKU_INPUT_USD_PER_MTOK).toBe(1);
    expect(STARTER_CHARS_PER_TOKEN).toBe(3);
    expect(STARTER_MAX_INPUT_TOKENS).toBe(50_000);
    expect(STARTER_MAX_INPUT_CHARS).toBe(150_000);
    expect(MAX_STARTER_CONTEXT_CHARS).toBe(147_500);
  });

  test("fail-closed when instruction + context exceed hard char cap", () => {
    const instruction = "x".repeat(3_000);
    const context = "y".repeat(STARTER_MAX_INPUT_CHARS);
    expect(isWithinStarterInputBudget(instruction, context)).toBe(false);
    expect(isWithinStarterInputBudget("short", '{"ok":true}')).toBe(true);
  });

  test("clampStarterContextJson truncates over budget", () => {
    const huge = "z".repeat(MAX_STARTER_CONTEXT_CHARS + 100);
    const clamped = clampStarterContextJson(huge);
    expect(clamped.length).toBe(MAX_STARTER_CONTEXT_CHARS);
  });
});

describe("agent starters cache key", () => {
  beforeEach(() => {
    clearStarterMemoryCache();
  });

  test("fingerprint uses sorted tip SHAs + count + default branch", () => {
    const history = linear(3);
    const fp = buildStarterHistoryFingerprint(history);
    expect(fp).toContain("tips=");
    expect(fp).toContain("count=3");
    expect(fp).toContain("default=main");
  });

  test("day key is day-month-year UTC", () => {
    expect(starterDayKey(new Date(Date.UTC(2026, 9, 22)))).toBe("22-10-2026");
  });

  test("cache key recipe under chronos:agent-starters", () => {
    const history = linear(2);
    const { key, snapshotHash } = resolveStarterCacheKey({
      owner: "octocat",
      repo: "Hello-World",
      workosUserId: "user_1",
      history,
      now: new Date(Date.UTC(2026, 9, 22)),
    });
    expect(key).toBe(starterCacheKey(snapshotHash));
    expect(key.startsWith("chronos:agent-starters:")).toBe(true);
    expect(snapshotHash).toHaveLength(32);

    const moved = {
      ...history,
      commits: [
        {
          sha: "newtip",
          parents: ["c0"],
          author: "ada",
          date: "2026-10-22T00:00:00Z",
          message: "tip",
        },
        ...history.commits,
      ],
      refs: history.refs.map((ref) =>
        ref.type === "branch" ? { ...ref, sha: "newtip" } : ref,
      ),
    };
    const next = resolveStarterCacheKey({
      owner: "octocat",
      repo: "Hello-World",
      workosUserId: "user_1",
      history: moved,
      now: new Date(Date.UTC(2026, 9, 22)),
    });
    expect(next.snapshotHash).not.toBe(snapshotHash);
  });

  test("same material yields stable snapshot hash", () => {
    const history = linear(2);
    const a = buildStarterCacheMaterial({
      owner: "octocat",
      repo: "Hello-World",
      workosUserId: "user_1",
      history,
      now: new Date(Date.UTC(2026, 9, 22)),
    });
    const b = buildStarterCacheMaterial({
      owner: "octocat",
      repo: "Hello-World",
      workosUserId: "user_1",
      history,
      now: new Date(Date.UTC(2026, 9, 22)),
    });
    expect(a.snapshotHash).toBe(b.snapshotHash);
  });

  test("memory cache round-trip when Redis is absent", async () => {
    const history = linear(2);
    const { key } = resolveStarterCacheKey({
      owner: "octocat",
      repo: "Hello-World",
      workosUserId: "user_1",
      history,
      now: new Date(Date.UTC(2026, 9, 22)),
    });
    const value = {
      starters: [
        { id: "a", label: "A?", prompt: "A?" },
        { id: "b", label: "B?", prompt: "B?" },
      ],
    };
    expect(await readStarterCache(key)).toBeNull();
    await writeStarterCache(key, value, new Date(Date.UTC(2026, 9, 22)));
    expect(await readStarterCache(key)).toEqual(value);
  });
});

describe("agent starters fallback", () => {
  test("static chips use default branch name", () => {
    const starters = staticAgentStarters(linear(3));
    expect(starters[0]?.label).toBe("Recent merges into main?");
    expect(starters[0]?.prompt).toBe("Recent merges into main?");
    expect(starters[1]?.label).toBe("Branches that share a parent?");
  });

  test("falls back to default when branch unknown", () => {
    const history = {
      commits: linear(1).commits,
      refs: [{ name: "HEAD", type: "head" as const, sha: "c0" }],
    };
    expect(staticAgentStarters(history)[0]?.label).toBe("Recent merges into default?");
  });

  test("static chips use API defaultBranch when it overrides the name heuristic", () => {
    const history = {
      ...linear(3),
      refs: [
        { name: "HEAD", type: "head" as const, sha: "c0" },
        { name: "main", type: "branch" as const, sha: "c0" },
        { name: "develop", type: "branch" as const, sha: "c0" },
      ],
    };
    expect(staticAgentStarters(history, "develop")[0]?.label).toBe(
      "Recent merges into develop?",
    );
  });
});

describe("agent starters client cache + paint", () => {
  beforeEach(() => {
    setClientStarterStorageForTests(memoryStorage());
  });

  afterEach(() => {
    setClientStarterStorageForTests(null);
  });

  test("skeleton count is stable (2–4 schema band)", () => {
    expect(STARTER_SLOT_COUNT).toBe(4);
    expect(STARTER_SKELETON_COUNT).toBe(STARTER_SLOT_COUNT);
  });

  test("local cache round-trip stores labels/prompts only", () => {
    const history = linear(2);
    const input = {
      owner: "octocat",
      repo: "Hello-World",
      history,
      now: new Date(Date.UTC(2026, 9, 22)),
    };
    const starters = [
      { id: "a", label: "Who merged last?", prompt: "Who merged last?" },
      { id: "b", label: "Share a parent?", prompt: "Share a parent?" },
    ];
    expect(readClientStarterCache(input)).toBeNull();
    writeClientStarterCache(input, starters, "abc123snapshot");
    const hit = readClientStarterCache(input);
    expect(hit?.starters).toEqual(starters);
    expect(hit?.snapshotHash).toBe("abc123snapshot");
    expect(hit?.dayKey).toBe("22-10-2026");
    expect(JSON.stringify(hit)).not.toContain("c0");
    clearClientStarterCache(input);
    expect(readClientStarterCache(input)).toBeNull();
  });

  test("local cache key changes when tips move", () => {
    const history = linear(2);
    const now = new Date(Date.UTC(2026, 9, 22));
    const a = clientStarterCacheKey({
      owner: "octocat",
      repo: "Hello-World",
      history,
      now,
    });
    const moved = {
      ...history,
      refs: history.refs.map((ref) =>
        ref.type === "branch" ? { ...ref, sha: "newtip" } : ref,
      ),
    };
    const b = clientStarterCacheKey({
      owner: "octocat",
      repo: "Hello-World",
      history: moved,
      now,
    });
    expect(a).not.toBe(b);
    expect(a.startsWith("chronos:agent-starters:v1:")).toBe(true);
    expect(hashClientStarterMaterial("x")).toHaveLength(8);
  });

  test("paint: miss → skeleton; hit → ready chips", () => {
    expect(paintFromLocalCache(null)).toEqual({
      phase: "loading",
      starters: [],
      clearLocalCache: false,
      writeLocalCache: false,
    });
    const starters = [
      { id: "a", label: "A?", prompt: "A?" },
      { id: "b", label: "B?", prompt: "B?" },
    ];
    expect(
      paintFromLocalCache({ starters, dayKey: "22-10-2026" }),
    ).toMatchObject({ phase: "ready", starters, writeLocalCache: false });
  });

  test("paint: API cache/generated writes local; fallback clears and shows static", () => {
    const fallback = staticAgentStarters(linear(2));
    const generated = [
      { id: "g1", label: "Gen 1?", prompt: "Gen 1?" },
      { id: "g2", label: "Gen 2?", prompt: "Gen 2?" },
    ];
    expect(
      paintFromStartersApi({
        source: "cache",
        starters: generated,
        fallback,
      }),
    ).toMatchObject({
      phase: "ready",
      starters: generated,
      writeLocalCache: true,
      clearLocalCache: false,
    });
    expect(
      paintFromStartersApi({
        source: "fallback",
        starters: fallback,
        fallback,
      }),
    ).toMatchObject({
      phase: "fallback",
      starters: fallback,
      writeLocalCache: false,
      clearLocalCache: true,
    });
    expect(
      paintFromStartersApi({ source: "generated", starters: null, fallback }),
    ).toMatchObject({ phase: "fallback", starters: fallback, clearLocalCache: true });
  });

  test("paint: fetch failure keeps cached chips else falls back", () => {
    const fallback = staticAgentStarters(linear(2));
    const cached = [
      { id: "c1", label: "Cached?", prompt: "Cached?" },
      { id: "c2", label: "Also?", prompt: "Also?" },
    ];
    expect(
      paintFromStartersFetchFailure({
        currentPhase: "ready",
        currentStarters: cached,
        fallback,
      }),
    ).toMatchObject({ phase: "ready", starters: cached });
    expect(
      paintFromStartersFetchFailure({
        currentPhase: "loading",
        currentStarters: [],
        fallback,
      }),
    ).toMatchObject({ phase: "fallback", starters: fallback });
  });
});

describe("agent starters redis cache-hit path", () => {
  beforeEach(() => {
    clearStarterMemoryCache();
  });

  test("memory GET after warm write stays well under 25ms", async () => {
    const history = linear(2);
    const { key } = resolveStarterCacheKey({
      owner: "octocat",
      repo: "Hello-World",
      workosUserId: "user_1",
      history,
      now: new Date(Date.UTC(2026, 9, 22)),
    });
    await writeStarterCache(
      key,
      {
        starters: [
          { id: "a", label: "A?", prompt: "A?" },
          { id: "b", label: "B?", prompt: "B?" },
        ],
      },
      new Date(Date.UTC(2026, 9, 22)),
    );
    const started = performance.now();
    const cached = await readStarterCache(key);
    const cacheReadMs = performance.now() - started;
    expect(cached?.starters).toHaveLength(2);
    expect(cacheReadMs).toBeLessThan(25);
  });
});
