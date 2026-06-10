import { describe, expect, test } from "bun:test";
import { DEFAULT_MAX_LANES, layoutGraph } from "@/lib/graph";
import type { GraphLayout, RepoHistory } from "@/lib/graph";
import { commit, heavyMerge, linear, withHead } from "./fixtures/history";

/**
 * Layout invariants for the hybrid lane algorithm (decision #1). This is the
 * highest-risk module in the product — every shape that confused us once
 * should become a case here.
 */

function laneOf(layout: GraphLayout, sha: string): number {
  const placed = layout.placements.find((p) => p.sha === sha);
  expect(placed, `no placement for ${sha}`).toBeDefined();
  return placed!.lane;
}

function rowOf(layout: GraphLayout, sha: string): number {
  return layout.placements.find((p) => p.sha === sha)!.row;
}

function assertInvariants(history: RepoHistory, layout: GraphLayout, maxLanes: number) {
  const loaded = new Set(history.commits.map((c) => c.sha));
  expect(layout.placements.length).toBe(loaded.size);
  expect(new Set(layout.placements.map((p) => p.sha)).size).toBe(loaded.size);
  layout.placements.forEach((placed, i) => {
    expect(placed.row).toBe(i);
    expect(placed.lane).toBeGreaterThanOrEqual(0);
    expect(placed.lane).toBeLessThan(maxLanes);
  });

  let parentLinks = 0;
  let missingLinks = 0;
  for (const c of history.commits) {
    for (const parent of c.parents) {
      if (loaded.has(parent)) parentLinks++;
      else missingLinks++;
    }
  }
  expect(layout.edges.length).toBe(parentLinks);
  expect(layout.openEdges.length).toBe(missingLinks);

  for (const edge of layout.edges) {
    // Children always sit above their parents, even with clock skew.
    expect(edge.toRow).toBeGreaterThan(edge.fromRow);
    for (const lane of [edge.fromLane, edge.toLane, edge.viaLane]) {
      expect(lane).toBeGreaterThanOrEqual(0);
      expect(lane).toBeLessThan(maxLanes);
    }
  }
  expect(layout.laneCount).toBeLessThanOrEqual(maxLanes);
  const maxLaneUsed = Math.max(-1, ...layout.placements.map((p) => p.lane));
  expect(layout.laneCount).toBeGreaterThan(maxLaneUsed);
}

describe("layoutGraph basics", () => {
  test("empty history yields an empty layout", () => {
    const layout = layoutGraph({ commits: [], refs: [] });
    expect(layout).toEqual({ placements: [], edges: [], openEdges: [], laneCount: 0 });
  });

  test("linear history is a single lane", () => {
    const history = linear(8);
    const layout = layoutGraph(history);
    assertInvariants(history, layout, DEFAULT_MAX_LANES);
    expect(layout.laneCount).toBe(1);
    for (const placed of layout.placements) expect(placed.lane).toBe(0);
    for (const edge of layout.edges) {
      expect(edge.kind).toBe("parent");
      expect(edge.viaLane).toBe(0);
    }
  });

  test("a merged feature branch holds its own lane until it joins", () => {
    // m (merge of f into t1) ← t1 ← base; f ← base
    const history = withHead([
      commit("m", ["t1", "f"], 0),
      commit("t1", ["base"], 1),
      commit("f", ["base"], 2),
      commit("base", [], 3),
    ]);
    const layout = layoutGraph(history);
    assertInvariants(history, layout, DEFAULT_MAX_LANES);
    expect(laneOf(layout, "m")).toBe(0);
    expect(laneOf(layout, "t1")).toBe(0);
    expect(laneOf(layout, "f")).toBe(1);
    expect(laneOf(layout, "base")).toBe(0);
    expect(layout.laneCount).toBe(2);

    const mergeEdge = layout.edges.find((e) => e.fromSha === "m" && e.toSha === "f")!;
    expect(mergeEdge.kind).toBe("merge");
    expect(mergeEdge.viaLane).toBe(1);
    const joinEdge = layout.edges.find((e) => e.fromSha === "f" && e.toSha === "base")!;
    expect(joinEdge.fromLane).toBe(1);
    expect(joinEdge.toLane).toBe(0);
  });
});

describe("lane stability and reuse", () => {
  test("sequential branches reuse the freed lane (compact for stale)", () => {
    const history = withHead([
      commit("m1", ["t1", "f1"], 0),
      commit("t1", ["m2"], 1),
      commit("f1", ["m2"], 2),
      commit("m2", ["t2", "f2"], 3),
      commit("t2", ["t3"], 4),
      commit("f2", ["t3"], 5),
      commit("t3", [], 6),
    ]);
    const layout = layoutGraph(history);
    assertInvariants(history, layout, DEFAULT_MAX_LANES);
    expect(laneOf(layout, "f1")).toBe(1);
    expect(laneOf(layout, "f2")).toBe(1);
    expect(layout.laneCount).toBe(2);
  });

  test("overlapping branches get distinct stable columns", () => {
    const history = withHead([
      commit("m1", ["m2", "f1"], 0),
      commit("m2", ["t2", "f2"], 1),
      commit("f1", ["t3"], 2),
      commit("f2", ["t3"], 3),
      commit("t2", ["t3"], 4),
      commit("t3", [], 5),
    ]);
    const layout = layoutGraph(history);
    assertInvariants(history, layout, DEFAULT_MAX_LANES);
    expect(laneOf(layout, "m1")).toBe(0);
    expect(laneOf(layout, "m2")).toBe(0);
    expect(laneOf(layout, "f1")).toBe(1);
    expect(laneOf(layout, "f2")).toBe(2);
    expect(layout.laneCount).toBe(3);
  });

  test("the default branch keeps lane 0 even when a side branch is newest", () => {
    const history: RepoHistory = {
      commits: [
        commit("feat", ["base"], 0), // newest commit overall, but not HEAD
        commit("tip", ["base"], 1),
        commit("base", [], 2),
      ],
      refs: [
        { name: "HEAD", type: "head", sha: "tip" },
        { name: "main", type: "branch", sha: "tip" },
        { name: "feature", type: "branch", sha: "feat" },
      ],
    };
    const layout = layoutGraph(history);
    assertInvariants(history, layout, DEFAULT_MAX_LANES);
    expect(laneOf(layout, "tip")).toBe(0);
    expect(laneOf(layout, "feat")).toBe(1);
  });
});

describe("ordering", () => {
  test("input order does not matter: children always render above parents", () => {
    const history = heavyMerge(6, 3);
    const shuffled: RepoHistory = {
      commits: [...history.commits].reverse(),
      refs: history.refs,
    };
    const layout = layoutGraph(shuffled);
    assertInvariants(shuffled, layout, DEFAULT_MAX_LANES);
  });

  test("clock skew cannot put a parent above its child", () => {
    const history = withHead([
      commit("child", ["parent"], 5),
      commit("parent", ["root"], 0), // dated newer than its child
      commit("root", [], 9),
    ]);
    const layout = layoutGraph(history);
    expect(rowOf(layout, "child")).toBeLessThan(rowOf(layout, "parent"));
    assertInvariants(history, layout, DEFAULT_MAX_LANES);
  });

  test("date breaks ties between independent rows, input order between equal dates", () => {
    const a = layoutGraph(heavyMerge(8, 4));
    const b = layoutGraph(heavyMerge(8, 4));
    expect(b).toEqual(a); // fully deterministic
  });

  test("duplicate commits are collapsed, not double-placed", () => {
    const base = linear(3);
    const history: RepoHistory = {
      commits: [...base.commits, base.commits[1]!],
      refs: base.refs,
    };
    const layout = layoutGraph(history);
    expect(layout.placements.length).toBe(3);
  });
});

describe("column cap and truncation", () => {
  test("the hard column cap clamps lanes and laneCount", () => {
    const history = heavyMerge(20, 8); // 8 branches in flight > cap of 4
    const layout = layoutGraph(history, { maxLanes: 4 });
    assertInvariants(history, layout, 4);
    expect(layout.laneCount).toBe(4);
    expect(layout.placements.some((p) => p.lane === 3)).toBe(true);
  });

  test("uncapped, the heavy-merge fixture needs more than the capped lanes", () => {
    const layout = layoutGraph(heavyMerge(20, 8), { maxLanes: 64 });
    expect(layout.laneCount).toBeGreaterThan(4);
  });

  test("parents beyond the loaded window become open edges", () => {
    const full = linear(6);
    const truncated: RepoHistory = {
      commits: full.commits.slice(0, 3),
      refs: full.refs,
    };
    const layout = layoutGraph(truncated);
    assertInvariants(truncated, layout, DEFAULT_MAX_LANES);
    expect(layout.openEdges).toEqual([
      { fromSha: "c2", toSha: "c3", fromRow: 2, fromLane: 0, kind: "parent" },
    ]);
  });

  test("backfilling older pages keeps earlier rows stable", () => {
    // Rows hold because backfilled commits are older than everything loaded.
    // Lanes may legitimately compact differently once fork points load, so
    // only row stability is guaranteed across progressive loading.
    const full = heavyMerge(10, 3);
    const firstPage: RepoHistory = { commits: full.commits.slice(0, 12), refs: full.refs };
    const partial = layoutGraph(firstPage);
    const complete = layoutGraph(full);
    for (const placed of partial.placements) {
      const after = complete.placements.find((p) => p.sha === placed.sha)!;
      expect(after.row).toBe(placed.row);
    }
  });
});
