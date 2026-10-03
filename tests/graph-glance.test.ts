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

/**
 * COA-209 — screenshot topology: main + open develop, one feature recovered
 * only from its merge message (no live tip), one feature still carrying a
 * live branch ref after landing on develop. Both must capsule-collapse.
 */
describe("COA-209 — live tip merged into develop still collapses", () => {
  // develop = D2 (merge speak) ← D1 (merge morph) ← d0 ← main
  // morph: tip deleted after merge (merge-message line only)
  // speak: live ref still at tip (the bug shape)
  const history: RepoHistory = {
    commits: [
      merge("D2", ["D1", "speak"], 0, "feat/speak-awareness"),
      commit("speak", ["s5"], 1),
      commit("s5", ["s4"], 2),
      commit("s4", ["s3"], 3),
      commit("s3", ["s2"], 4),
      commit("s2", ["s1"], 5),
      commit("s1", ["d0"], 6),
      merge("D1", ["d0", "morph"], 7, "chore/morph-physics"),
      commit("morph", ["m1"], 8),
      commit("m1", ["d0"], 9),
      commit("d0", ["main"], 10),
      commit("main", [], 11),
    ],
    refs: refs(
      { name: "HEAD", type: "head", sha: "main" },
      { name: "main", type: "branch", sha: "main" },
      { name: "develop", type: "branch", sha: "D2" },
      { name: "feat/speak-awareness", type: "branch", sha: "speak" },
    ),
  };

  test("both develop-staged features fold to capsules (live tip + deleted tip)", () => {
    const { history: out, capsules, applied } = applyGlance(history, BOTH);
    expect(applied).toBe(true);

    expect(capsules.get("morph")).toMatchObject({
      name: "chore/morph-physics",
      commitCount: 2,
    });
    expect(capsules.get("speak")).toMatchObject({
      name: "feat/speak-awareness",
      commitCount: 6,
    });

    // Interiors gone; real tips kept for selection/inspection.
    for (const gone of ["s5", "s4", "s3", "s2", "s1", "m1"]) {
      expect(out.commits.some((c) => c.sha === gone)).toBe(false);
    }
    expect(out.commits.some((c) => c.sha === "speak")).toBe(true);
    expect(out.commits.some((c) => c.sha === "morph")).toBe(true);
  });

  test("capsules attach to the develop fork points; develop stays expanded", () => {
    const { history: out } = applyGlance(history, BOTH);
    expect(out.commits.find((c) => c.sha === "speak")!.parents).toEqual(["d0"]);
    expect(out.commits.find((c) => c.sha === "morph")!.parents).toEqual(["d0"]);
    expect(out.commits.find((c) => c.sha === "D2")!.parents).toEqual(["D1", "speak"]);
    expect(out.commits.find((c) => c.sha === "D1")!.parents).toEqual(["d0", "morph"]);
    for (const sha of ["D2", "D1", "d0", "main"]) {
      expect(out.commits.some((c) => c.sha === sha)).toBe(true);
    }
    expect(layoutGraph(out).openEdges).toHaveLength(0);
  });

  test("an unmerged sibling beside the live merged tip stays expanded", () => {
    const historyWithWip: RepoHistory = {
      commits: [
        commit("wip2", ["wip1"], 0),
        commit("wip1", ["D2"], 1),
        merge("D2", ["D1", "speak"], 2, "feat/speak-awareness"),
        commit("speak", ["s5"], 3),
        commit("s5", ["s4"], 4),
        commit("s4", ["s3"], 5),
        commit("s3", ["s2"], 6),
        commit("s2", ["s1"], 7),
        commit("s1", ["d0"], 8),
        merge("D1", ["d0", "morph"], 9, "chore/morph-physics"),
        commit("morph", ["m1"], 10),
        commit("m1", ["d0"], 11),
        commit("d0", ["main"], 12),
        commit("main", [], 13),
      ],
      refs: refs(
        { name: "HEAD", type: "head", sha: "main" },
        { name: "main", type: "branch", sha: "main" },
        { name: "develop", type: "branch", sha: "D2" },
        { name: "feat/speak-awareness", type: "branch", sha: "speak" },
        { name: "feat/wip", type: "branch", sha: "wip2" },
      ),
    };
    const { history: out, capsules } = applyGlance(historyWithWip, BOTH);
    expect(capsules.has("speak")).toBe(true);
    expect(capsules.has("morph")).toBe(true);
    expect(capsules.has("wip2")).toBe(false);
    // Critical: develop must NOT capsule-collapse just because wip forked
    // from it. Plain ancestry would fold the staging trunk (organic-llm).
    expect(capsules.has("D2")).toBe(false);
    expect(out.commits.some((c) => c.sha === "D1")).toBe(true);
    expect(out.commits.some((c) => c.sha === "d0")).toBe(true);
    expect(out.commits.some((c) => c.sha === "wip1")).toBe(true);
    expect(out.commits.some((c) => c.sha === "wip2")).toBe(true);
  });
});

/**
 * COA-209 follow-up — organic-llm shape: several open features ahead of
 * develop. Plain "reachable from another open tip" collapses develop into
 * a multi-dozen capsule and blows up the graph. Spine-aware staging must
 * keep develop expanded while still folding landed side work.
 */
describe("COA-209 — develop stays expanded when children fork from it", () => {
  const history: RepoHistory = {
    commits: [
      commit("voice2", ["voice1"], 0),
      commit("voice1", ["D3"], 1),
      commit("mem2", ["mem1"], 2),
      commit("mem1", ["D3"], 3),
      merge("D3", ["D2", "speak"], 4, "feat/speak-awareness"),
      commit("speak", ["s2"], 5),
      commit("s2", ["s1"], 6),
      commit("s1", ["D1"], 7),
      merge("D2", ["D1", "morph"], 8, "chore/morph-physics"),
      commit("morph", ["m1"], 9),
      commit("m1", ["D1"], 10),
      commit("D1", ["d0"], 11),
      commit("d0", ["main"], 12),
      commit("main", [], 13),
    ],
    refs: refs(
      { name: "HEAD", type: "head", sha: "main" },
      { name: "main", type: "branch", sha: "main" },
      { name: "develop", type: "branch", sha: "D3" },
      { name: "feat/speak-awareness", type: "branch", sha: "speak" },
      { name: "feat/realtime-voice", type: "branch", sha: "voice2" },
      { name: "feat/memory-feedback", type: "branch", sha: "mem2" },
    ),
  };

  test("landed features capsule; develop and open WIPs stay expanded", () => {
    const { history: out, capsules } = applyGlance(history, BOTH);

    expect(capsules.get("speak")).toMatchObject({
      name: "feat/speak-awareness",
      commitCount: 3,
    });
    expect(capsules.get("morph")).toMatchObject({
      name: "chore/morph-physics",
      commitCount: 2,
    });

    expect(capsules.has("D3")).toBe(false);
    expect(capsules.has("voice2")).toBe(false);
    expect(capsules.has("mem2")).toBe(false);

    // Develop spine intact (no interior drop from a bogus develop capsule).
    for (const sha of ["D3", "D2", "D1", "d0", "main"]) {
      expect(out.commits.some((c) => c.sha === sha)).toBe(true);
    }
    for (const sha of ["voice2", "voice1", "mem2", "mem1"]) {
      expect(out.commits.some((c) => c.sha === sha)).toBe(true);
    }
    expect(out.commits.find((c) => c.sha === "D3")!.parents).toEqual(["D2", "speak"]);
    expect(layoutGraph(out).openEdges).toHaveLength(0);
  });
});
