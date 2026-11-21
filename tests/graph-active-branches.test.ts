import { describe, expect, test } from "bun:test";
import {
  ACTIVE_BRANCH_RAIL_CAP,
  layoutGraph,
  listActiveBranches,
  shouldShowActiveBranchRail,
} from "@/lib/graph";
import type { RepoHistory } from "@/lib/graph";
import { commit } from "./fixtures/history";

describe("listActiveBranches", () => {
  test("ranks trunk → staging → open by tip row, then name", () => {
    // main at tipRow 1 (older tip), develop at 0, two open features.
    // Graph (newest first):
    //   d0 (develop) ← m0 (main) ← base
    //   f-a ← base
    //   f-b ← base
    const history: RepoHistory = {
      commits: [
        commit("d0", ["m0"], 0),
        commit("m0", ["base"], 1),
        commit("fa", ["base"], 2),
        commit("fb", ["base"], 3),
        commit("base", [], 4),
      ],
      refs: [
        { name: "HEAD", type: "head", sha: "m0" },
        { name: "main", type: "branch", sha: "m0" },
        { name: "develop", type: "branch", sha: "d0" },
        { name: "feat/b", type: "branch", sha: "fb" },
        { name: "feat/a", type: "branch", sha: "fa" },
      ],
    };
    const layout = layoutGraph(history);
    const active = listActiveBranches(history, layout, "main");

    expect(active.map((b) => b.name)).toEqual([
      "main",
      "develop",
      "feat/a",
      "feat/b",
    ]);
    expect(active.map((b) => b.kind)).toEqual([
      "default",
      "staging",
      "open",
      "open",
    ]);
  });

  test("omits tips already reachable from default (merged)", () => {
    // feature tip is an ancestor of main → not active.
    const history: RepoHistory = {
      commits: [
        commit("m0", ["feat", "old"], 0),
        commit("feat", ["old"], 1),
        commit("old", [], 2),
      ],
      refs: [
        { name: "HEAD", type: "head", sha: "m0" },
        { name: "main", type: "branch", sha: "m0" },
        { name: "feature/done", type: "branch", sha: "feat" },
      ],
    };
    const layout = layoutGraph(history);
    const active = listActiveBranches(history, layout, "main");
    expect(active.map((b) => b.name)).toEqual(["main"]);
  });

  test("skips refs whose tips are not in the layout", () => {
    const history: RepoHistory = {
      commits: [commit("m0", [], 0)],
      refs: [
        { name: "HEAD", type: "head", sha: "m0" },
        { name: "main", type: "branch", sha: "m0" },
        { name: "ghost", type: "branch", sha: "missing" },
      ],
    };
    const layout = layoutGraph(history);
    expect(listActiveBranches(history, layout).map((b) => b.name)).toEqual(["main"]);
  });

  test("rail shows only when the active set is within the cap", () => {
    expect(shouldShowActiveBranchRail([])).toBe(false);
    expect(
      shouldShowActiveBranchRail(
        Array.from({ length: ACTIVE_BRANCH_RAIL_CAP }, (_, i) => ({
          name: `b${i}`,
          tipSha: `s${i}`,
          tipRow: i,
          lane: 0,
          kind: "open" as const,
          priority: 2,
        })),
      ),
    ).toBe(true);
    expect(
      shouldShowActiveBranchRail(
        Array.from({ length: ACTIVE_BRANCH_RAIL_CAP + 1 }, (_, i) => ({
          name: `b${i}`,
          tipSha: `s${i}`,
          tipRow: i,
          lane: 0,
          kind: "open" as const,
          priority: 2,
        })),
      ),
    ).toBe(false);
  });
});
