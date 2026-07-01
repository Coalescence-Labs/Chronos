import { describe, expect, test } from "bun:test";
import { reachableFromRefs } from "@/lib/graph";
import type { RepoHistory } from "@/lib/graph";
import { fetchPublicRepoHistory, refreshRepoHistory } from "@/lib/ingest/client";
import type { RefreshResult } from "@/lib/ingest/client";
import { commit } from "./fixtures/history";
import { branch, tag, upstreamMock } from "./fixtures/scenarios";
import type { Upstream } from "./fixtures/scenarios";

/**
 * Refresh correctness (COA-129): for every git event that can happen between
 * loads, clicking Refresh must land on the same view a from-scratch load of
 * the new upstream state would produce — additions AND removals. Each
 * scenario is a `before` upstream (what the user loaded) and an `after`
 * upstream (what the remote looks like now); the harness asserts
 * refresh(load(before), after) ≡ freshLoad(after).
 */

const REPO = "acme/widgets";
const PAGE = 3; // small pages so trunk paging + gap-fill are exercised

async function freshLoad(upstream: Upstream): Promise<RepoHistory> {
  const { fetchImpl } = upstreamMock(upstream, { pageSize: PAGE });
  let result = await fetchPublicRepoHistory(REPO, { fetchImpl });
  while (result.loadMore) result = await result.loadMore();
  return result.history;
}

interface RefreshRun {
  result: RefreshResult;
  /** Requests the refresh itself made (not the initial load). */
  calls: string[];
  /** The object handed to refresh — reconciliation applies in place. */
  loaded: RepoHistory;
}

async function refreshAcross(before: Upstream, after: Upstream): Promise<RefreshRun> {
  const loaded = await freshLoad(before);
  const { fetchImpl, calls } = upstreamMock(after, { pageSize: PAGE });
  const result = await refreshRepoHistory(REPO, loaded, { fetchImpl });
  return { result, calls, loaded };
}

/** Order-insensitive equality surface: commit DAG + refs + reachability. */
function normalize(history: RepoHistory) {
  return {
    commits: [...history.commits]
      .map(({ sha, parents }) => ({ sha, parents }))
      .sort((a, b) => a.sha.localeCompare(b.sha)),
    refs: [...history.refs]
      .map(({ name, type, sha }) => ({ name, type, sha }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

async function expectMatchesFreshLoad(run: RefreshRun, after: Upstream): Promise<void> {
  const fresh = await freshLoad(after);
  expect(normalize(run.result.history)).toEqual(normalize(fresh));
  expect(reachableFromRefs(run.result.history)).toEqual(reachableFromRefs(fresh));
  // No duplicate rows ever.
  const shas = run.result.history.commits.map((c) => c.sha);
  expect(new Set(shas).size).toBe(shas.length);
  // Reconciliation happened in the loaded object (viewport/selection survive).
  expect(run.result.history).toBe(run.loaded);
}

const shas = (history: RepoHistory) => history.commits.map((c) => c.sha);

// Shared base: trunk m1 ← m0; feature/x (f2 ← f1) forked at m1.
// minutesAgo encodes recency: smaller = newer.
const trunk = () => [commit("m1", ["m0"], 90), commit("m0", [], 100)];
const featureLine = () => [commit("f2", ["f1"], 70), commit("f1", ["m1"], 80)];

const BASE: Upstream = {
  commits: [...trunk(), ...featureLine()],
  refs: [branch("main", "m1"), branch("feature/x", "f2")],
  defaultBranch: "main",
};

describe("refresh reconciles like a fresh load", () => {
  test("1. branch squash-merged via PR, then deleted — stale feature line pruned", async () => {
    const after: Upstream = {
      commits: [commit("s1", ["m1"], 30), ...trunk()],
      refs: [branch("main", "s1")],
      defaultBranch: "main",
    };
    const run = await refreshAcross(BASE, after);
    await expectMatchesFreshLoad(run, after);

    expect(run.result.changed).toBe(true);
    expect(run.result.pruned).toBe(2); // f2, f1 — unreachable upstream now
    expect(shas(run.result.history)).not.toContain("f1");
    expect(shas(run.result.history)).not.toContain("f2");
    expect(run.result.history.refs.some((r) => r.name === "feature/x")).toBe(false);
    // The whole reconcile cost one request: the fresh page connects directly.
    expect(run.calls).toEqual(["/api/repo?repo=acme%2Fwidgets"]);
  });

  test("2. branch merged via merge commit, then deleted — merge kept, ref gone", async () => {
    const after: Upstream = {
      commits: [commit("M", ["m1", "f2"], 50), ...trunk(), ...featureLine()],
      refs: [branch("main", "M")],
      defaultBranch: "main",
    };
    const run = await refreshAcross(BASE, after);
    await expectMatchesFreshLoad(run, after);

    expect(run.result.pruned).toBe(0); // f-line is reachable through the merge
    const merge = run.result.history.commits.find((c) => c.sha === "M");
    expect(merge?.parents).toEqual(["m1", "f2"]);
    expect(run.result.history.refs.some((r) => r.name === "feature/x")).toBe(false);
    expect(shas(run.result.history)).toContain("f1");
  });

  test("3. branch merged via merge commit, branch retained — ref stays on its tip", async () => {
    const after: Upstream = {
      commits: [commit("M", ["m1", "f2"], 50), ...trunk(), ...featureLine()],
      refs: [branch("main", "M"), branch("feature/x", "f2")],
      defaultBranch: "main",
    };
    const run = await refreshAcross(BASE, after);
    await expectMatchesFreshLoad(run, after);

    expect(run.result.history.refs).toContainEqual(branch("feature/x", "f2"));
    expect(run.result.history.commits.find((c) => c.sha === "M")?.parents).toEqual([
      "m1",
      "f2",
    ]);
  });

  test("4. branch rebased — new line shown, pre-rebase line pruned, no duplicates", async () => {
    const before: Upstream = {
      commits: [commit("m2", ["m1"], 60), ...trunk(), ...featureLine()],
      refs: [branch("main", "m2"), branch("feature/x", "f2")],
      defaultBranch: "main",
    };
    const after: Upstream = {
      commits: [
        commit("r2", ["r1"], 30),
        commit("r1", ["m2"], 40),
        commit("m2", ["m1"], 60),
        ...trunk(),
      ],
      refs: [branch("main", "m2"), branch("feature/x", "r2")],
      defaultBranch: "main",
    };
    const run = await refreshAcross(before, after);
    await expectMatchesFreshLoad(run, after);

    expect(run.result.pruned).toBe(2); // f2, f1
    expect(run.result.added).toBe(2); // r2, r1
    expect(shas(run.result.history)).toContain("r2");
    expect(shas(run.result.history)).not.toContain("f2");
    // One /api/repo + one page to anchor the moved tip.
    expect(run.calls).toHaveLength(2);
  });

  test("5. cherry-pick — both copies render on their lines, parents intact", async () => {
    const after: Upstream = {
      commits: [commit("p1", ["m1"], 35), ...trunk(), ...featureLine()],
      refs: [branch("main", "p1"), branch("feature/x", "f2")],
      defaultBranch: "main",
    };
    const run = await refreshAcross(BASE, after);
    await expectMatchesFreshLoad(run, after);

    // The pick is a distinct commit; the original is not collapsed into it.
    expect(shas(run.result.history)).toContain("p1");
    expect(shas(run.result.history)).toContain("f1");
    expect(run.result.history.commits.find((c) => c.sha === "p1")?.parents).toEqual(["m1"]);
    expect(run.result.history.commits.find((c) => c.sha === "f1")?.parents).toEqual(["m1"]);
    expect(run.result.pruned).toBe(0);
  });

  test("6. merge landed beyond page 1 — gap-fill pages until connected", async () => {
    const after: Upstream = {
      commits: [
        commit("a4", ["a3"], 10),
        commit("a3", ["a2"], 20),
        commit("a2", ["a1"], 25),
        commit("a1", ["M"], 28),
        commit("M", ["m1", "f2"], 50),
        ...trunk(),
        ...featureLine(),
      ],
      refs: [branch("main", "a4"), branch("feature/x", "f2")],
      defaultBranch: "main",
    };
    const run = await refreshAcross(BASE, after);
    await expectMatchesFreshLoad(run, after);

    // Page 1 (a4,a3,a2) dangles at a1 → exactly one gap page (a1,M,f2) connects.
    expect(run.calls).toEqual([
      "/api/repo?repo=acme%2Fwidgets",
      "/api/repo/commits?repo=acme%2Fwidgets&sha=main&page=2",
    ]);
    expect(run.result.history.commits.find((c) => c.sha === "M")?.parents).toEqual([
      "m1",
      "f2",
    ]);
    expect(run.result.pruned).toBe(0);
  });

  test("7. force-push/amend — rewritten tip replaces the old one", async () => {
    const after: Upstream = {
      commits: [commit("g2", ["f1"], 65), commit("f1", ["m1"], 80), ...trunk()],
      refs: [branch("main", "m1"), branch("feature/x", "g2")],
      defaultBranch: "main",
    };
    const run = await refreshAcross(BASE, after);
    await expectMatchesFreshLoad(run, after);

    expect(shas(run.result.history)).toContain("g2");
    expect(shas(run.result.history)).toContain("f1"); // shared history survives
    expect(shas(run.result.history)).not.toContain("f2"); // amended away
    expect(run.result.pruned).toBe(1);
  });

  test("happy path — nothing changed costs one request and zero churn", async () => {
    const run = await refreshAcross(BASE, BASE);
    expect(run.calls).toEqual(["/api/repo?repo=acme%2Fwidgets"]);
    expect(run.result.changed).toBe(false);
    expect(run.result.added).toBe(0);
    expect(run.result.pruned).toBe(0);
    expect(run.result.history).toBe(run.loaded);
    await expectMatchesFreshLoad(run, BASE);
  });

  test("new branch appears — one page anchors it", async () => {
    const after: Upstream = {
      ...BASE,
      commits: [...BASE.commits, commit("n1", ["m1"], 15)],
      refs: [...BASE.refs, branch("new/y", "n1")],
    };
    const run = await refreshAcross(BASE, after);
    await expectMatchesFreshLoad(run, after);
    expect(shas(run.result.history)).toContain("n1");
    expect(run.calls).toHaveLength(2); // /api/repo + the new tip's page
  });

  test("tag added and tag deleted — refs reconcile, history untouched", async () => {
    const before: Upstream = { ...BASE, refs: [...BASE.refs, tag("v1", "m0")] };
    const after: Upstream = { ...BASE, refs: [...BASE.refs, tag("v2", "m1")] };
    const run = await refreshAcross(before, after);
    await expectMatchesFreshLoad(run, after);

    expect(run.result.changed).toBe(true);
    expect(run.result.history.refs.some((r) => r.name === "v1")).toBe(false);
    expect(run.result.history.refs).toContainEqual(tag("v2", "m1"));
    expect(run.result.pruned).toBe(0); // m0 is still trunk history
    expect(run.calls).toEqual(["/api/repo?repo=acme%2Fwidgets"]);
  });

  test("branch fast-forwarded — tip re-anchors, nothing pruned", async () => {
    const before: Upstream = {
      commits: [commit("f1", ["m1"], 80), ...trunk()],
      refs: [branch("main", "m1"), branch("feature/x", "f1")],
      defaultBranch: "main",
    };
    const after: Upstream = {
      commits: [commit("f2", ["f1"], 70), commit("f1", ["m1"], 80), ...trunk()],
      refs: [branch("main", "m1"), branch("feature/x", "f2")],
      defaultBranch: "main",
    };
    const run = await refreshAcross(before, after);
    await expectMatchesFreshLoad(run, after);
    expect(run.result.added).toBe(1);
    expect(run.result.pruned).toBe(0);
  });

  test("trunk advance outruns the page cap — degrades to fresh-load semantics", async () => {
    // 40 new commits on top of m1; the cap (10 pages × 3) can't bridge the
    // gap, so disconnected old rows are pruned — exactly what a fresh load
    // (which never had them) would show.
    const advance = Array.from({ length: 40 }, (_, i) => {
      const n = 40 - i; // a40 (newest) … a1
      return commit(`a${n}`, [n === 1 ? "m1" : `a${n - 1}`], 10 + i);
    });
    const before: Upstream = {
      commits: trunk(),
      refs: [branch("main", "m1")],
      defaultBranch: "main",
    };
    const after: Upstream = {
      commits: [...advance, ...trunk()],
      refs: [branch("main", "a40")],
      defaultBranch: "main",
    };
    const run = await refreshAcross(before, after);
    await expectMatchesFreshLoad(run, after);

    expect(run.result.pruned).toBe(2); // m1, m0 — unreachable across the gap
    expect(run.result.history.commits).toHaveLength(30); // 10 pages × 3
    expect(run.calls).toHaveLength(10); // /api/repo + gap pages 2..10
  });

  test("compound event: merge+delete, rebase, and a new tag in one refresh", async () => {
    const before: Upstream = {
      commits: [
        ...trunk(),
        ...featureLine(),
        commit("g1", ["m1"], 75), // second feature, about to be rebased
      ],
      refs: [...BASE.refs, branch("feature/y", "g1")],
      defaultBranch: "main",
    };
    const after: Upstream = {
      commits: [
        commit("h1", ["M"], 20), // feature/y rebased onto the merge
        commit("M", ["m1", "f2"], 50), // feature/x merged…
        ...trunk(),
        ...featureLine(),
      ],
      refs: [branch("main", "M"), branch("feature/y", "h1"), tag("v1", "M")],
      defaultBranch: "main",
    };
    const run = await refreshAcross(before, after);
    await expectMatchesFreshLoad(run, after);

    expect(run.result.pruned).toBe(1); // g1
    expect(shas(run.result.history)).toContain("h1");
    expect(run.result.history.refs).toContainEqual(tag("v1", "M"));
    expect(run.result.history.refs.some((r) => r.name === "feature/x")).toBe(false);
  });
});
