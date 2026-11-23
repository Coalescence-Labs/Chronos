import { describe, expect, test } from "bun:test";
import { attributeBranches, layoutGraph, stapleRole } from "@/lib/graph";
import type { RepoHistory } from "@/lib/graph";
import { commit } from "./fixtures/history";

describe("stapleRole (COA-784)", () => {
  test("main, master and trunk are the trunk in every repo", () => {
    for (const name of ["main", "master", "trunk", "Main"]) expect(stapleRole(name)).toBe("trunk");
  });

  test("develop and its aliases are develop", () => {
    for (const name of ["develop", "dev", "development"]) expect(stapleRole(name)).toBe("develop");
  });

  test("the default branch is the trunk whatever it's called", () => {
    expect(stapleRole("production", "production")).toBe("trunk");
    expect(stapleRole("production")).toBeUndefined();
  });

  test("names win over default-ness, so develop never turns trunk-colored", () => {
    expect(stapleRole("develop", "develop")).toBe("develop");
  });

  test("ordinary branches have no staple role", () => {
    for (const name of ["feature/main", "main-backup", "release/1.0"]) {
      expect(stapleRole(name)).toBeUndefined();
    }
  });
});

describe("attributeBranches default-first claiming", () => {
  test("a non-main default branch owns the history it shares with other branches", () => {
    const history: RepoHistory = {
      commits: [commit("p", ["base"], 0), commit("base", [], 1)],
      refs: [
        { name: "feature/x", type: "branch", sha: "base" },
        { name: "production", type: "branch", sha: "p" },
      ],
    };
    const layout = layoutGraph(history);
    expect(attributeBranches(history, layout).lineBySha.get("base")?.name).toBe("feature/x");
    expect(attributeBranches(history, layout, "production").lineBySha.get("base")?.name).toBe(
      "production",
    );
  });
});
