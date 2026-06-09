import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import Home from "@/app/page";
import { layoutGraph, type RepoHistory } from "@/lib/graph";
import { GraphView } from "@/components/graph/GraphView";

describe("smoke", () => {
  test("root route renders", () => {
    const html = renderToString(<Home />);
    expect(html).toContain("Chronos");
  });

  test("layoutGraph places every commit", () => {
    const history: RepoHistory = {
      commits: [
        { sha: "b", parents: ["a"], author: "alex", date: "2026-06-09T00:00:00Z", message: "second" },
        { sha: "a", parents: [], author: "alex", date: "2026-06-08T00:00:00Z", message: "first" },
      ],
      refs: [{ name: "main", type: "branch", sha: "b" }],
    };
    const layout = layoutGraph(history);
    expect(layout.placements).toHaveLength(2);
    expect(layout.laneCount).toBeGreaterThan(0);
  });

  test("GraphView renders a node per placed commit", () => {
    const layout = layoutGraph({
      commits: [{ sha: "a", parents: [], author: "alex", date: "2026-06-08T00:00:00Z", message: "first" }],
      refs: [],
    });
    const html = renderToString(<GraphView layout={layout} />);
    expect(html).toContain("<svg");
    expect(html).toContain("<circle");
  });
});
