import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GET as getCommits } from "@/app/api/repo/commits/route";
import { GET as getRepo } from "@/app/api/repo/route";
import { GraphView } from "@/components/graph/GraphView";
import { DEFAULT_MAX_LANES, layoutGraph } from "@/lib/graph";
import { fetchPublicRepoHistory } from "@/lib/ingest/client";
import { mockGitHub, smallRepoHandler } from "./fixtures/github";
import { heavyMerge } from "./fixtures/history";

/**
 * COA-71 acceptance: the whole pipeline — BFF routes → client adapter →
 * hybrid lane layout → renderer — on clean, heavy-merge, and large fixtures,
 * plus the perf budget that justifies running layout on the main thread.
 */

let restore: (() => void) | null = null;
afterEach(() => {
  restore?.();
  restore = null;
});

/** Routes BFF-relative URLs to the real route handlers (GitHub is mocked). */
const bffFetch = ((input: RequestInfo | URL) => {
  const url = new URL(input.toString(), "http://localhost");
  const request = new Request(url);
  if (url.pathname === "/api/repo") return getRepo(request);
  if (url.pathname === "/api/repo/commits") return getCommits(request);
  throw new Error(`unexpected BFF path: ${url.pathname}`);
}) as typeof fetch;

describe("ingestion → layout → render", () => {
  test("a pasted URL becomes a rendered graph (clean repo with one merge)", async () => {
    restore = mockGitHub(smallRepoHandler);
    const { history, truncated } = await fetchPublicRepoHistory(
      "https://github.com/acme/widgets",
      { fetchImpl: bffFetch },
    );
    expect(truncated).toBe(false);

    const layout = layoutGraph(history);
    expect(layout.placements).toHaveLength(5);
    expect(layout.openEdges).toHaveLength(0);
    expect(layout.laneCount).toBe(2); // trunk + the merged feature branch

    const html = renderToStaticMarkup(
      createElement(GraphView, { history, layout }),
    );
    expect(html.split('role="option"').length - 1).toBe(5);
    expect(html).toContain("feat: change for c5");
    expect(html).toContain(">main</button>"); // branch badges are trace buttons
    expect(html).toContain(">feature</button>");
    expect(html).toContain(">v1.0.0</span>"); // tags stay plain markers
  });

  test("a heavy-merge history stays within the lane cap and renders", () => {
    const history = heavyMerge(40, 8); // 8 branches always in flight
    const layout = layoutGraph(history);
    expect(layout.laneCount).toBeLessThanOrEqual(DEFAULT_MAX_LANES);
    expect(layout.laneCount).toBeGreaterThan(2);

    const html = renderToStaticMarkup(createElement(GraphView, { history, layout }));
    expect(html).toContain('role="listbox"');
    expect(html).toContain("<path"); // merge edges drawn
  });
});

describe("perf budget (decision: layout on the main thread, no worker)", () => {
  test("laying out 20k commits stays under 800ms on this hardware", () => {
    const history = heavyMerge(10_000, 6);
    expect(history.commits.length).toBeGreaterThan(20_000);

    const start = performance.now();
    const layout = layoutGraph(history);
    const elapsed = performance.now() - start;

    expect(layout.placements).toHaveLength(history.commits.length);
    // ~110–200ms measured on the Pi 5 (arm64); 800ms keeps 4× headroom while
    // still guaranteeing layout never blocks a paint for a full second.
    expect(elapsed).toBeLessThan(800);
  });

  test("rendering the virtualized window of 20k commits is cheap", () => {
    const history = heavyMerge(10_000, 6);
    const layout = layoutGraph(history);

    const start = performance.now();
    const html = renderToStaticMarkup(createElement(GraphView, { history, layout }));
    const elapsed = performance.now() - start;

    expect(html.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(800);
  });
});
