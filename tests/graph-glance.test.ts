import { describe, expect, test } from "bun:test";
import { applyGlance, layoutGraph } from "@/lib/graph";
import type { CommitNode, Ref, RepoHistory } from "@/lib/graph";
import { commit } from "./fixtures/history";

/**
 * Glance-mode transform (COA-75). Acceptance: hide branches merged into
 * default; collapse branches merged into a non-default branch; leave truly
 * unmerged branches expanded; OFF is identity; no default branch → no-op.
 */

const merge = (sha: string, parents: string[], minutesAgo: number, name: string): CommitNode => ({
  ...commit(sha, parents, minutesAgo),
  message: `Merge branch '${name}'`,
});

const BOTH = { hideMergedIntoDefault: true, collapseMergedIntoNonDefault: true };
const refs = (...rs: Ref[]): Ref[] => rs;

describe("applyGlance — no-ops", () => {
  test("flags off is a pure identity (same history object)", () => {
    const history: RepoHistory = {
      commits: [commit("a", [], 0)],
      refs: [{ name: "main", type: "branch", sha: "a" }],
    };
    const result = applyGlance(history, {
      hideMergedIntoDefault: false,
      collapseMergedIntoNonDefault: false,
    });
    expect(result.applied).toBe(false);
    expect(result.history).toBe(history);
    expect(result.capsules.size).toBe(0);
  });

  test("no identifiable default branch → no-op even with flags on", () => {
    const history: RepoHistory = {
      commits: [commit("b", ["a"], 0), commit("a", [], 1)],
      refs: [{ name: "topic", type: "branch", sha: "b" }], // no main/master/HEAD
    };
    const result = applyGlance(history, BOTH);
    expect(result.applied).toBe(false);
    expect(result.history.commits).toHaveLength(2);
  });
});

describe("Feature A — hide branches merged into default", () => {
  // M (merge of feature/x) ← m1 ← base on main; f1 is feature/x, off base.
  const history: RepoHistory = {
    commits: [
      merge("M", ["m1", "f1"], 0, "feature/x"),
      commit("m1", ["base"], 1),
      commit("f1", ["base"], 2),
      commit("base", [], 3),
    ],
    refs: refs(
      { name: "HEAD", type: "head", sha: "M" },
      { name: "main", type: "branch", sha: "M" },
    ),
  };

  test("drops the merged side commit, keeps the spine", () => {
    const { history: out, applied } = applyGlance(history, {
      hideMergedIntoDefault: true,
      collapseMergedIntoNonDefault: false,
    });
    expect(applied).toBe(true);
    expect(out.commits.map((c) => c.sha)).toEqual(["M", "m1", "base"]);
  });

  test("the merge commit loses its hidden parent (no dangling stub)", () => {
    const { history: out } = applyGlance(history, {
      hideMergedIntoDefault: true,
      collapseMergedIntoNonDefault: false,
    });
    const m = out.commits.find((c) => c.sha === "M")!;
    expect(m.parents).toEqual(["m1"]); // f1 dropped → plain trunk node
    // And the reduced history lays out cleanly as a single lane.
    expect(layoutGraph(out).openEdges).toHaveLength(0);
    expect(layoutGraph(out).laneCount).toBe(1);
  });

  test("a branch merged into default that another open branch still needs is kept", () => {
    // feature/x (f1) is merged into main AND is part of develop's history.
    const shared: RepoHistory = {
      commits: [
        commit("d1", ["f1"], 0), // develop builds on f1
        merge("M", ["m1", "f1"], 1, "feature/x"),
        commit("m1", ["base"], 2),
        commit("f1", ["base"], 3),
        commit("base", [], 4),
      ],
      refs: refs(
        { name: "HEAD", type: "head", sha: "M" },
        { name: "main", type: "branch", sha: "M" },
        { name: "develop", type: "branch", sha: "d1" },
      ),
    };
    const { history: out } = applyGlance(shared, {
      hideMergedIntoDefault: true,
      collapseMergedIntoNonDefault: false,
    });
    expect(out.commits.some((c) => c.sha === "f1")).toBe(true); // protected by develop
  });
});

describe("Feature B — collapse branches merged into a non-default branch", () => {
  // main = m1. develop = D (merge of feature/y). feature/y = gtip ← gmid,
  // forked from develop's d1. Not in main's history.
  const history: RepoHistory = {
    commits: [
      merge("D", ["d1", "gtip"], 0, "feature/y"),
      commit("gtip", ["gmid"], 1),
      commit("gmid", ["d1"], 2),
      commit("d1", ["m1"], 3),
      commit("m1", [], 4),
    ],
    refs: refs(
      { name: "HEAD", type: "head", sha: "m1" },
      { name: "main", type: "branch", sha: "m1" },
      { name: "develop", type: "branch", sha: "D" },
    ),
  };

  test("folds the feature to a single capsule at its real tip", () => {
    const { history: out, capsules, applied } = applyGlance(history, {
      hideMergedIntoDefault: false,
      collapseMergedIntoNonDefault: true,
    });
    expect(applied).toBe(true);
    expect(out.commits.some((c) => c.sha === "gmid")).toBe(false); // interior gone
    expect(out.commits.some((c) => c.sha === "gtip")).toBe(true); // tip kept
    const capsule = capsules.get("gtip")!;
    expect(capsule).toMatchObject({ name: "feature/y", commitCount: 2 });
  });

  test("the capsule tip attaches to the fork point on develop", () => {
    const { history: out } = applyGlance(history, {
      hideMergedIntoDefault: false,
      collapseMergedIntoNonDefault: true,
    });
    expect(out.commits.find((c) => c.sha === "gtip")!.parents).toEqual(["d1"]);
    expect(out.commits.find((c) => c.sha === "D")!.parents).toEqual(["d1", "gtip"]);
    expect(layoutGraph(out).openEdges).toHaveLength(0);
  });

  test("develop itself stays expanded; only the feature folds", () => {
    const { history: out } = applyGlance(history, {
      hideMergedIntoDefault: false,
      collapseMergedIntoNonDefault: true,
    });
    for (const sha of ["D", "d1", "m1"]) {
      expect(out.commits.some((c) => c.sha === sha)).toBe(true);
    }
  });
});

describe("truly unmerged branches stay fully expanded", () => {
  test("an open feature with no merge keeps all its commits, no capsule", () => {
    const history: RepoHistory = {
      commits: [
        commit("t2", ["t1"], 0), // unmerged topic, two commits
        commit("t1", ["m1"], 1),
        commit("m1", [], 2),
      ],
      refs: refs(
        { name: "HEAD", type: "head", sha: "m1" },
        { name: "main", type: "branch", sha: "m1" },
        { name: "topic", type: "branch", sha: "t2" },
      ),
    };
    const { history: out, capsules } = applyGlance(history, BOTH);
    expect(out.commits.map((c) => c.sha).sort()).toEqual(["m1", "t1", "t2"]);
    expect(capsules.size).toBe(0); // topic is the open tip — never collapsed
  });
});
