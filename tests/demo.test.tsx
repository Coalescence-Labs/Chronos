import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import DemoPage from "@/app/demo/page";
import { demoHistory } from "@/lib/demo/history";
import { DEFAULT_MAX_LANES, layoutGraph } from "@/lib/graph";

describe("demo history", () => {
  test("is a well-formed normalized model", () => {
    const history = demoHistory();
    const shas = new Set(history.commits.map((c) => c.sha));
    expect(shas.size).toBe(history.commits.length);
    for (const ref of history.refs) expect(shas.has(ref.sha)).toBe(true);

    // Newest first, like real ingestion output.
    const times = history.commits.map((c) => Date.parse(c.date));
    for (let i = 1; i < times.length; i++) expect(times[i - 1]!).toBeGreaterThan(times[i]!);

    // Exactly one intentionally-unloaded parent: the truncated root.
    const missing = history.commits.flatMap((c) => c.parents.filter((p) => !shas.has(p)));
    expect(missing).toHaveLength(1);
  });

  test("is deterministic and interesting enough to demo", () => {
    expect(demoHistory()).toEqual(demoHistory());

    const history = demoHistory();
    expect(history.commits.length).toBeGreaterThan(35);
    const layout = layoutGraph(history);
    expect(layout.laneCount).toBeGreaterThanOrEqual(3); // parallel branches visible
    expect(layout.laneCount).toBeLessThanOrEqual(DEFAULT_MAX_LANES);
    expect(layout.openEdges).toHaveLength(1); // the truncated-root stub

    const branchNames = history.refs.filter((r) => r.type === "branch").map((r) => r.name);
    expect(branchNames).toContain("main");
    expect(branchNames).toContain("develop");
    expect(history.refs.some((r) => r.type === "tag")).toBe(true);
  });
});

describe("demo page", () => {
  test("renders the graph with no network", () => {
    const html = renderToString(<DemoPage />);
    expect(html).toContain('role="listbox"');
    expect(html).toContain(">main</button>");
    expect(html).toContain(">develop</button>");
    expect(html).toContain("synthetic history");
  });
});
