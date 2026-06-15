import { describe, expect, test } from "bun:test";
import {
  attributeBranches,
  branchLines,
  layoutGraph,
  mergedBranchName,
  packShelves,
  pinnedLines,
} from "@/lib/graph";
import type { RepoHistory } from "@/lib/graph";
import { commit, withHead } from "./fixtures/history";

describe("mergedBranchName", () => {
  test("recovers names from the common merge-subject shapes", () => {
    expect(mergedBranchName("Merge branch 'feature/auth'")).toBe("feature/auth");
    expect(mergedBranchName("Merge branch 'fix-1' into develop")).toBe("fix-1");
    expect(mergedBranchName("Merge remote-tracking branch 'origin/jc/doc-hook'")).toBe(
      "jc/doc-hook",
    );
    expect(mergedBranchName("Merge pull request #6 from acme/feature/badges")).toBe(
      "feature/badges",
    );
    expect(mergedBranchName("Merge feature/url-ingestion into develop")).toBe(
      "feature/url-ingestion",
    );
    expect(mergedBranchName("Merge main back into develop")).toBe("main");
  });

  test("returns undefined for ordinary subjects", () => {
    expect(mergedBranchName("Add passkey support")).toBeUndefined();
    expect(mergedBranchName("Mergers and acquisitions")).toBeUndefined();
  });
});

describe("branchLines", () => {
  // m (merge of f) ← t1 ← base on main; f ← base merged via message.
  const history = withHead([
    { ...commit("m", ["t1", "f"], 0), message: "Merge branch 'feature/x'" },
    commit("t1", ["base"], 1),
    commit("f", ["base"], 2),
    commit("base", [], 3),
  ]);
  const layout = layoutGraph(history);

  test("live refs claim their first-parent chain; merges recover the rest", () => {
    const lines = branchLines(history, layout);
    expect(lines).toEqual([
      { name: "main", source: "ref", tipSha: "m", tipRow: 0, lastRow: 3, lane: 0 },
      { name: "feature/x", source: "merge", tipSha: "f", tipRow: 2, lastRow: 2, lane: 1 },
    ]);
  });

  test("higher-priority refs win shared history", () => {
    const shared: RepoHistory = {
      commits: [
        commit("d0", ["t0"], 0),
        commit("t0", ["t1"], 1),
        commit("t1", [], 2),
      ],
      refs: [
        { name: "HEAD", type: "head", sha: "t0" },
        { name: "develop", type: "branch", sha: "d0" }, // listed first, loses anyway
        { name: "main", type: "branch", sha: "t0" },
      ],
    };
    const lines = branchLines(shared, layoutGraph(shared));
    const main = lines.find((l) => l.name === "main")!;
    const develop = lines.find((l) => l.name === "develop")!;
    expect(main.lastRow).toBe(2); // trunk belongs to main…
    expect(develop.lastRow).toBe(0); // …develop only keeps its own commit
  });

  test("a merge whose second parent is already claimed adds no line", () => {
    // develop merges main back in; main's ref still claims that commit, so
    // the merge message must not spawn a duplicate "main" line.
    const folded: RepoHistory = {
      commits: [
        { ...commit("d1", ["d2", "t1"], 0), message: "Merge main back into develop" },
        commit("d2", ["t2"], 1),
        commit("t1", ["t2"], 2),
        commit("t2", [], 3),
      ],
      refs: [
        { name: "HEAD", type: "head", sha: "t1" },
        { name: "main", type: "branch", sha: "t1" },
        { name: "develop", type: "branch", sha: "d1" },
      ],
    };
    const lines = branchLines(folded, layoutGraph(folded));
    expect(lines.map((l) => l.name).sort()).toEqual(["develop", "main"]);
    expect(lines.every((l) => l.source === "ref")).toBe(true);
  });
});

describe("attributeBranches lineBySha (trace foundation, COA-84)", () => {
  // m (merge of feature/x via f) ← t1 ← base on main; f ← base.
  const history = withHead([
    { ...commit("m", ["t1", "f"], 0), message: "Merge branch 'feature/x'" },
    commit("t1", ["base"], 1),
    commit("f", ["base"], 2),
    commit("base", [], 3),
  ]);
  const layout = layoutGraph(history);
  const { lineBySha } = attributeBranches(history, layout);

  test("every claimed commit maps to its owning line", () => {
    expect(lineBySha.get("m")!.name).toBe("main");
    expect(lineBySha.get("t1")!.name).toBe("main");
    expect(lineBySha.get("base")!.name).toBe("main"); // trunk first-parent chain
    expect(lineBySha.get("f")!.name).toBe("feature/x"); // recovered merged line
  });

  test("the merged side commit belongs to the merged line, not the trunk", () => {
    expect(lineBySha.get("f")).not.toBe(lineBySha.get("m"));
    // shared identity by reference is how the renderer groups a traced line
    expect(lineBySha.get("m")).toBe(lineBySha.get("t1"));
  });

  test("branchLines stays a thin wrapper over attributeBranches", () => {
    expect(branchLines(history, layout)).toEqual(attributeBranches(history, layout).lines);
  });
});

describe("pinnedLines", () => {
  const lines = branchLines(
    withHead([
      { ...commit("m", ["t1", "f"], 0), message: "Merge branch 'feature/x'" },
      commit("t1", ["base"], 1),
      commit("f", ["base"], 2),
      commit("base", [], 3),
    ]),
    layoutGraph(
      withHead([
        { ...commit("m", ["t1", "f"], 0), message: "Merge branch 'feature/x'" },
        commit("t1", ["base"], 1),
        commit("f", ["base"], 2),
        commit("base", [], 3),
      ]),
    ),
  );

  test("a line pins only between its tip leaving view and its line ending", () => {
    expect(pinnedLines(lines, 0).map((l) => l.name)).toEqual([]); // tip visible
    expect(pinnedLines(lines, 1.5).map((l) => l.name)).toEqual(["main"]);
    expect(pinnedLines(lines, 3).map((l) => l.name)).toEqual(["main"]); // f's line ended
    expect(pinnedLines(lines, 99)).toEqual([]); // everything scrolled past
  });
});

describe("packShelves", () => {
  test("non-overlapping badges share a shelf; overlapping ones stack", () => {
    expect(
      packShelves([
        { start: 0, width: 50 },
        { start: 60, width: 50 },
        { start: 70, width: 50 },
      ]),
    ).toEqual([0, 0, 1]);
  });

  test("drops badges once every shelf is occupied", () => {
    const crowded = [0, 1, 2, 3].map((i) => ({ start: i * 2, width: 100 }));
    expect(packShelves(crowded, { maxShelves: 3 })).toEqual([0, 1, 2, -1]);
  });
});
