import { describe, expect, test } from "bun:test";
import {
  commitIndex,
  pruneUnreachable,
  reachableFrom,
  reachableFromRefs,
} from "@/lib/graph";
import type { Ref, RepoHistory } from "@/lib/graph";
import { commit } from "./fixtures/history";

/**
 * COA-127: reachability + prune are what turn an additive refresh into a
 * correct one — commits no current ref can reach must go.
 */

const branch = (name: string, sha: string): Ref => ({ name, type: "branch", sha });
const tag = (name: string, sha: string): Ref => ({ name, type: "tag", sha });

describe("commitIndex", () => {
  test("indexes by sha, keeping the first occurrence of duplicates", () => {
    const first = commit("a", [], 0);
    const dupe = { ...commit("a", [], 5), message: "later copy" };
    const index = commitIndex([first, dupe, commit("b", ["a"], 1)]);
    expect(index.size).toBe(2);
    expect(index.get("a")).toBe(first);
  });
});

describe("reachableFrom", () => {
  // main: m0 ← m1 ← m2; feature forked at m2: f0 ← f1 ← m2
  const commits = [
    commit("m0", ["m1"], 0),
    commit("f0", ["f1"], 1),
    commit("m1", ["m2"], 2),
    commit("f1", ["m2"], 3),
    commit("m2", [], 4),
  ];
  const bySha = commitIndex(commits);

  test("walks every parent link from every tip", () => {
    expect(reachableFrom(["m0"], bySha)).toEqual(new Set(["m0", "m1", "m2"]));
    expect(reachableFrom(["f0"], bySha)).toEqual(new Set(["f0", "f1", "m2"]));
    expect(reachableFrom(["m0", "f0"], bySha)).toEqual(
      new Set(["m0", "m1", "m2", "f0", "f1"]),
    );
  });

  test("skips tips and parents that aren't loaded (truncation frontier)", () => {
    expect(reachableFrom(["missing"], bySha)).toEqual(new Set());
    const truncated = commitIndex([commit("x", ["unloaded"], 0)]);
    expect(reachableFrom(["x"], truncated)).toEqual(new Set(["x"]));
  });

  test("merge commits reach through both parents", () => {
    const merged = commitIndex([
      commit("merge", ["m1", "f1"], 0),
      commit("m1", [], 1),
      commit("f1", [], 2),
    ]);
    expect(reachableFrom(["merge"], merged)).toEqual(new Set(["merge", "m1", "f1"]));
  });

  test("tolerates cycles in hostile input", () => {
    const cyclic = commitIndex([commit("a", ["b"], 0), commit("b", ["a"], 1)]);
    expect(reachableFrom(["a"], cyclic)).toEqual(new Set(["a", "b"]));
  });
});

describe("reachableFromRefs / pruneUnreachable", () => {
  test("keeps everything a branch, tag, or HEAD can reach; drops the rest", () => {
    // orphan0 ← orphan1 was a rebased-away line; t0 is tag-only history.
    const history: RepoHistory = {
      commits: [
        commit("m0", ["m1"], 0),
        commit("orphan0", ["orphan1"], 1),
        commit("m1", [], 2),
        commit("orphan1", ["m1"], 3),
        commit("t0", ["m1"], 4),
      ],
      refs: [branch("main", "m0"), tag("v1", "t0")],
    };

    expect(reachableFromRefs(history)).toEqual(new Set(["m0", "m1", "t0"]));
    const { history: pruned, pruned: count } = pruneUnreachable(history);
    expect(count).toBe(2);
    expect(pruned.commits.map((c) => c.sha)).toEqual(["m0", "m1", "t0"]);
    expect(pruned.refs).toBe(history.refs);
    // No kept commit references a pruned parent (closed under parenthood).
    const kept = new Set(pruned.commits.map((c) => c.sha));
    const prunedShas = ["orphan0", "orphan1"];
    for (const c of pruned.commits) {
      for (const parent of c.parents) expect(prunedShas).not.toContain(parent);
    }
    expect(kept.has("t0")).toBe(true);
  });

  test("is the identity (same object, zero count) when everything is reachable", () => {
    const history: RepoHistory = {
      commits: [commit("m0", ["m1"], 0), commit("m1", [], 1)],
      refs: [branch("main", "m0")],
    };
    const result = pruneUnreachable(history);
    expect(result.pruned).toBe(0);
    expect(result.history).toBe(history);
  });

  test("a ref pointing at an unloaded sha contributes nothing but breaks nothing", () => {
    const history: RepoHistory = {
      commits: [commit("m0", [], 0)],
      refs: [branch("main", "m0"), branch("feature/unloaded", "nowhere")],
    };
    const result = pruneUnreachable(history);
    expect(result.pruned).toBe(0);
    expect(result.history.commits.map((c) => c.sha)).toEqual(["m0"]);
  });

  test("an empty history prunes to an empty history", () => {
    const empty: RepoHistory = { commits: [], refs: [] };
    expect(pruneUnreachable(empty)).toEqual({ history: empty, pruned: 0 });
  });
});
