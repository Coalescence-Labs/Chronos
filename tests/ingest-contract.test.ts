import { describe, expect, test } from "bun:test";
import { layoutGraph } from "@/lib/graph";
import type { RepoHistory } from "@/lib/graph/types";
import { toBranchRefs, toCommitNode, toTagRefs } from "@/lib/ingest/github/map";
import { SMALL_REPO } from "./fixtures/github";

/**
 * The normalized model is the contract between ingestion and lib/graph
 * (docs/ARCHITECTURE.md "Module boundaries"). Mapped GitHub data must be
 * directly consumable by the pure layout engine, and plain data — safe to
 * serialize across the BFF boundary with nothing lost.
 */

function mapSmallRepo(): RepoHistory {
  return {
    commits: SMALL_REPO.commits.map(toCommitNode),
    refs: [...toBranchRefs(SMALL_REPO.branches), ...toTagRefs(SMALL_REPO.tags)],
  };
}

describe("normalized model contract", () => {
  test("mapped history feeds lib/graph layout directly", () => {
    const history = mapSmallRepo();
    const layout = layoutGraph(history);
    expect(layout.placements).toHaveLength(history.commits.length);
    expect(layout.placements[0]?.sha).toBe("c5");
  });

  test("merge topology survives the mapping (parent edges intact)", () => {
    const history = mapSmallRepo();
    const merge = history.commits.find((commit) => commit.parents.length > 1);
    expect(merge?.sha).toBe("c5");
    expect(merge?.parents).toEqual(["c4", "c3"]);
    const shas = new Set(history.commits.map((commit) => commit.sha));
    for (const commit of history.commits) {
      for (const parent of commit.parents) {
        expect(shas.has(parent)).toBe(true);
      }
    }
  });

  test("model is plain JSON-serializable data", () => {
    const history = mapSmallRepo();
    expect(JSON.parse(JSON.stringify(history))).toEqual(history);
  });
});
