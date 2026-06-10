import type { CommitNode, Ref, RepoHistory } from "@/lib/graph";

/**
 * Synthetic-but-plausible history for /demo: a small team building Chronos
 * itself — feature branches merging into develop, develop releasing into
 * main with tags, a hotfix, unmerged branches in flight, and a truncated
 * root so open-edge stubs show. Deterministic, generated in memory, zero
 * network — exists precisely so the visuals are reachable when GitHub's
 * rate limit isn't.
 */

const START_TIME = Date.parse("2026-04-02T09:00:00Z");

/** Deterministic 40-char fake sha (LCG), so the demo is stable across loads. */
function pseudoSha(n: number): string {
  let x = (n + 1) * 0x9e3779b1;
  let out = "";
  while (out.length < 40) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    out += x.toString(16);
  }
  return out.slice(0, 40);
}

interface FeatureSpec {
  name: string;
  by: string;
  commits: string[];
  /** Release tagged right after this feature merges. */
  releaseAfter?: string;
}

const FEATURES: FeatureSpec[] = [
  {
    name: "feature/url-ingestion",
    by: "grace",
    commits: ["Parse pasted repo URLs", "Handle SSH-style remotes too"],
    releaseAfter: "v0.1.0",
  },
  {
    name: "feature/lane-layout",
    by: "ada",
    commits: ["Add lane allocator", "Reuse freed lanes for stale branches", "Cap columns on phones"],
  },
  {
    name: "feature/svg-renderer",
    by: "margaret",
    commits: ["Draw nodes and elbow edges", "Virtualize rows around the viewport"],
    releaseAfter: "v0.2.0",
  },
  {
    name: "feature/inspection-sheet",
    by: "barbara",
    commits: ["Bottom sheet on phones", "Side panel on laptops"],
  },
  {
    name: "feature/zoom-gestures",
    by: "grace",
    commits: ["Pinch and ctrl-wheel zoom", "Anchor zoom under the pointer"],
    releaseAfter: "v0.3.0",
  },
  {
    name: "feature/ref-badges",
    by: "ada",
    commits: ["Hang badges off their nodes", "Tie badge colors to lanes"],
  },
  {
    name: "feature/keyboard-nav",
    by: "barbara",
    commits: ["Listbox semantics for the graph", "Arrows, Home/End, Escape to clear"],
    releaseAfter: "v0.4.0",
  },
  {
    name: "feature/open-edges",
    by: "margaret",
    commits: ["Dashed stubs for unloaded parents"],
  },
];

export const DEMO_OWNER = "chronos";
export const DEMO_REPO = "demo";

export function demoHistory(): RepoHistory {
  const commits: CommitNode[] = [];
  const tags: Ref[] = [];
  let serial = 0;
  let tick = 0;

  const add = (message: string, parents: string[], author: string): string => {
    const sha = pseudoSha(serial++);
    // Irregular cadence (37–217 min) so rows don't look metronomic.
    tick += 37 + ((serial * 53) % 180);
    commits.push({
      sha,
      parents,
      author,
      date: new Date(START_TIME + tick * 60_000).toISOString(),
      message,
    });
    return sha;
  };

  // Truncated root: its parent is never loaded, so the graph shows the
  // open-edge stub that real progressive loading produces.
  let main = add("Import existing prototype history", [pseudoSha(99_999)], "ada");
  main = add("Set up CI and linting", [main], "grace");
  main = add("Scaffold app shell and design tokens", [main], "ada");

  let develop = add("Wire normalized git model", [main], "margaret");

  for (const feature of FEATURES) {
    let branch = develop;
    for (const message of feature.commits) {
      branch = add(message, [branch], feature.by);
    }
    develop = add(`Merge ${feature.name} into develop`, [develop, branch], "ada");

    if (feature.releaseAfter) {
      main = add(`Release ${feature.releaseAfter}`, [main, develop], "ada");
      tags.push({ name: feature.releaseAfter, type: "tag", sha: main });
    }

    // Mid-history hotfix straight onto main, folded back into develop.
    if (feature.releaseAfter === "v0.2.0") {
      const fix = add("Hotfix: escape repo names in proxy URLs", [main], "barbara");
      main = add("Merge hotfix/proxy-escaping into main", [main, fix], "barbara");
      develop = add("Merge main back into develop", [develop, main], "ada");
    }
  }

  // Work still in flight: unmerged branches with visible tips.
  let wip = add("Spike: summarize a branch with ZDR-only AI", [develop], "linus");
  wip = add("Sketch consent surface for AI calls", [wip], "linus");
  const perf = add("Profile layout on 20k-commit fixture", [develop], "margaret");

  develop = add("Polish empty and error states", [develop], "barbara");

  const refs: Ref[] = [
    { name: "HEAD", type: "head", sha: main },
    { name: "main", type: "branch", sha: main },
    { name: "develop", type: "branch", sha: develop },
    { name: "feature/ai-branch-summaries-zdr-spike", type: "branch", sha: wip },
    { name: "feature/perf-budget", type: "branch", sha: perf },
    ...tags,
  ];

  // Newest first, mirroring what ingestion produces.
  return { commits: commits.reverse(), refs };
}
