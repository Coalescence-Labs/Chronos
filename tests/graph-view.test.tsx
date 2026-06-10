import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { GraphView } from "@/components/graph/GraphView";
import { DEFAULT_MAX_LANES, layoutGraph } from "@/lib/graph";
import type { RepoHistory } from "@/lib/graph";
import { commit, heavyMerge, withHead } from "./fixtures/history";

/**
 * Renderer contract: accessibility roles, non-color cues, and virtualization.
 * CSS-module class names render empty under bun test, so assertions stick to
 * structure and ARIA, never class names.
 */

function render(history: RepoHistory, selectedSha?: string) {
  const layout = layoutGraph(history);
  return renderToStaticMarkup(
    <GraphView history={history} layout={layout} selectedSha={selectedSha} />,
  );
}

const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("GraphView accessibility", () => {
  const history = withHead([
    commit("m", ["t1", "f"], 0),
    commit("t1", ["base"], 1),
    commit("f", ["base"], 2),
    commit("base", [], 3),
  ]);

  test("exposes the graph as a keyboard-focusable listbox of commits", () => {
    const html = render(history);
    expect(html).toContain('role="listbox"');
    expect(html).toContain('aria-label="Commit graph, 4 commits"');
    expect(html).toContain('tabindex="0"');
    expect(count(html, 'role="option"')).toBe(4);
    expect(html).toContain('aria-posinset="1"');
    expect(html).toContain(`aria-setsize="4"`);
  });

  test("selection is reflected in aria-activedescendant and aria-selected", () => {
    const html = render(history, "f");
    expect(html).toContain('aria-activedescendant="gv-f"');
    expect(count(html, 'aria-selected="true"')).toBe(1);
    expect(html).toContain('id="gv-f" role="option" aria-selected="true"');
  });

  test("the SVG is decorative; rows carry the accessible text", () => {
    const html = render(history);
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(html).toContain("change m");
    expect(html).toContain("ada");
    expect(html).toContain("2026-06-01");
  });

  test("zoom controls are labelled buttons", () => {
    const html = render(history);
    for (const label of ["Zoom in", "Zoom out", "Reset zoom"]) {
      expect(html).toContain(`aria-label="${label}"`);
    }
  });

  test("merge commits are hollow rings — a shape cue, not color alone", () => {
    const html = render(history);
    const circles = html.match(/<circle[^>]*>/g)!;
    expect(circles).toHaveLength(4);
    const hollow = circles.filter((c) => c.includes('stroke-width="2"'));
    expect(hollow).toHaveLength(1); // only the merge commit m
    expect(hollow[0]).toContain("var(--bg-elevated)");
  });

  test("branch and tag refs render as badges on their rows", () => {
    const html = render(history);
    expect(html).toContain(">main</span>");
    expect(html).not.toContain(">HEAD<"); // HEAD duplicates the default branch
    // Full name survives ellipsis via the tooltip.
    expect(html).toContain('title="main"');
  });

  test("branch badges wear their lane's color, tying label to line", () => {
    const html = render(history); // main on lane 0, f's branch line on lane 1
    const badge = html.match(/<span[^>]*data-ref-type="branch"[^>]*>main<\/span>/)![0];
    expect(badge).toContain("var(--lane-0)");
  });

  test("long-term branches carry fixed identity colors", () => {
    const withDevelop: RepoHistory = {
      commits: history.commits,
      refs: [
        ...history.refs,
        { name: "develop", type: "branch", sha: "f" },
        { name: "feature/very-long-name", type: "branch", sha: "t1" },
        { name: "v1.0.0", type: "tag", sha: "base" },
      ],
    };
    const html = renderToStaticMarkup(
      <GraphView history={withDevelop} layout={layoutGraph(withDevelop)} />,
    );
    expect(html).toMatch(/data-branch-role="main"[^>]*>main</);
    expect(html).toMatch(/data-branch-role="develop"[^>]*>develop</);
    // Anchor badges are filled with the lane color (dark text on color).
    const main = html.match(/<span[^>]*data-branch-role="main"[^>]*>/)![0];
    expect(main).toContain("background:var(--lane-0)");
    expect(main).toContain("var(--on-accent)");
    // Short-lived branches and tags get no identity role.
    expect(html).not.toMatch(/data-branch-role[^>]*>feature\/very-long-name</);
    expect(html).not.toMatch(/data-branch-role[^>]*>v1\.0\.0</);
  });
});

describe("GraphView virtualization", () => {
  test("only the rows near the viewport reach the DOM", () => {
    const history = heavyMerge(10_000, 6); // 20k commits
    const layout = layoutGraph(history);
    const html = renderToStaticMarkup(<GraphView history={history} layout={layout} />);

    const options = count(html, 'role="option"');
    expect(options).toBeGreaterThan(10); // fills the initial viewport
    expect(options).toBeLessThan(60); // …but never the whole history
    expect(count(html, "<circle")).toBe(options);
    expect(html).toContain(`aria-setsize="${layout.placements.length}"`);
  });

  test("lane colors come from the cyclic token palette", () => {
    const history = heavyMerge(20, 8);
    const layout = layoutGraph(history, { maxLanes: DEFAULT_MAX_LANES });
    const html = renderToStaticMarkup(<GraphView history={history} layout={layout} />);
    expect(html).toContain("var(--lane-0)");
    expect(html).toContain("var(--lane-1)");
    expect(html).not.toMatch(/(stroke|fill)="#/);
  });
});
