import { describe, expect, test } from "bun:test";
import { DEFAULT_MAX_LANES, layoutGraph } from "@/lib/graph";
import type { CommitNode, GraphLayout, Ref, RepoHistory } from "@/lib/graph";

/**
 * Property-based coverage for the layout engine (COA-91). The example tests in
 * graph-layout.test.ts pin specific shapes; this throws many random-but-valid
 * commit DAGs at layoutGraph and asserts the invariants hold for all of them —
 * hardening the highest-risk module against shapes nobody wrote by hand.
 *
 * Generators are seeded so any failure is reproducible: the seed is included
 * in every assertion message.
 */

/** Deterministic PRNG (mulberry32) so a failing case can be replayed. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BASE_TIME = Date.parse("2026-06-01T12:00:00Z");

interface GeneratedCase {
  history: RepoHistory;
  /** Commits actually loaded (a truncation may drop the oldest ones). */
  loadedCount: number;
}

/**
 * Build a valid history: commit i (newest = 0) only references parents j > i,
 * so the DAG is acyclic and children precede parents in input order. Adds
 * merges, multiple branch refs, clock skew, and optional truncation.
 */
function generate(seed: number): GeneratedCase {
  const next = rng(seed);
  const pick = (n: number) => Math.floor(next() * n);

  const count = 1 + pick(60); // 1..60 commits
  const commits: CommitNode[] = [];
  for (let i = 0; i < count; i++) {
    const olderRange = count - i - 1; // indices i+1..count-1 are older
    const parents: string[] = [];
    if (olderRange > 0) {
      // First parent: usually the immediate next, sometimes a jump.
      parents.push(`c${i + 1 + pick(Math.min(olderRange, next() < 0.7 ? 1 : olderRange))}`);
      // ~25% merge: a second parent further back.
      if (next() < 0.25 && olderRange > 1) {
        const second = `c${i + 1 + pick(olderRange)}`;
        if (second !== parents[0]) parents.push(second);
      }
    }
    // Clock skew: dates mostly descend with index but jitter can invert them.
    const skew = (next() - 0.5) * 90; // ±45 min
    commits.push({
      sha: `c${i}`,
      parents,
      author: ["ada", "grace", "linus"][pick(3)]!,
      date: new Date(BASE_TIME - i * 60_000 + skew * 60_000).toISOString(),
      message: `change c${i}`,
    });
  }

  // Truncation: sometimes only the newest `loadedCount` commits are "loaded",
  // leaving dangling parents that must become open edges.
  const loadedCount = next() < 0.4 ? 1 + pick(count) : count;
  const loaded = commits.slice(0, loadedCount);
  const loadedShas = new Set(loaded.map((c) => c.sha));

  const refs: Ref[] = [];
  if (loaded.length > 0) {
    refs.push({ name: "HEAD", type: "head", sha: loaded[0]!.sha });
    refs.push({ name: "main", type: "branch", sha: loaded[0]!.sha });
    // A handful of extra branch/tag refs at random loaded commits.
    const extra = pick(4);
    for (let k = 0; k < extra; k++) {
      const target = loaded[pick(loaded.length)]!.sha;
      refs.push(
        next() < 0.7
          ? { name: `branch-${k}`, type: "branch", sha: target }
          : { name: `v${k}.0`, type: "tag", sha: target },
      );
    }
  }

  return { history: { commits: loaded, refs }, loadedCount: loadedShas.size };
}

function checkInvariants(history: RepoHistory, layout: GraphLayout, maxLanes: number, seed: number) {
  const tag = `seed=${seed}`;
  const loaded = new Set(history.commits.map((c) => c.sha));
  const rowOf = new Map(layout.placements.map((p) => [p.sha, p.row]));

  expect(layout.placements.length, tag).toBe(loaded.size);
  expect(new Set(layout.placements.map((p) => p.sha)).size, tag).toBe(loaded.size);
  layout.placements.forEach((placed, i) => {
    expect(placed.row, tag).toBe(i);
    expect(placed.lane, tag).toBeGreaterThanOrEqual(0);
    expect(placed.lane, tag).toBeLessThan(maxLanes);
  });

  let parentLinks = 0;
  let missingLinks = 0;
  for (const c of history.commits) {
    for (const parent of c.parents) {
      if (loaded.has(parent)) parentLinks++;
      else missingLinks++;
    }
  }
  expect(layout.edges.length, tag).toBe(parentLinks);
  expect(layout.openEdges.length, tag).toBe(missingLinks);

  for (const edge of layout.edges) {
    // Children always sit above their parents, even under clock skew.
    expect(edge.toRow, tag).toBeGreaterThan(edge.fromRow);
    expect(rowOf.get(edge.fromSha), tag).toBe(edge.fromRow);
    expect(rowOf.get(edge.toSha), tag).toBe(edge.toRow);
    for (const lane of [edge.fromLane, edge.toLane, edge.viaLane]) {
      expect(lane, tag).toBeGreaterThanOrEqual(0);
      expect(lane, tag).toBeLessThan(maxLanes);
    }
  }
  for (const open of layout.openEdges) {
    expect(loaded.has(open.fromSha), tag).toBe(true);
    expect(loaded.has(open.toSha), tag).toBe(false); // only unloaded parents
  }

  expect(layout.laneCount, tag).toBeLessThanOrEqual(maxLanes);
  const maxLaneUsed = Math.max(-1, ...layout.placements.map((p) => p.lane));
  expect(layout.laneCount, tag).toBeGreaterThan(maxLaneUsed);
}

describe("layoutGraph property tests", () => {
  test("holds the layout invariants for random valid histories", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { history } = generate(seed);
      const maxLanes = seed % 5 === 0 ? 4 : DEFAULT_MAX_LANES; // exercise the cap too
      checkInvariants(history, layoutGraph(history, { maxLanes }), maxLanes, seed);
    }
  });

  test("is deterministic — same input lays out identically", () => {
    for (let seed = 1; seed <= 120; seed++) {
      const { history } = generate(seed);
      expect(layoutGraph(history), `seed=${seed}`).toEqual(layoutGraph(history));
    }
  });

  test("any input order still yields a valid layout (topo order is recovered)", () => {
    for (let seed = 1; seed <= 120; seed++) {
      const { history } = generate(seed);
      const shuffled: RepoHistory = { commits: [...history.commits].reverse(), refs: history.refs };
      // Equal-date ties are broken by input index (by design), so the exact
      // lanes may differ — but the layout must remain valid for any order.
      checkInvariants(shuffled, layoutGraph(shuffled), DEFAULT_MAX_LANES, seed);
    }
  });
});
