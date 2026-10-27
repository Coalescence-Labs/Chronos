import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RepoAgentChrome } from "@/components/agent/RepoAgentChrome";
import { linear } from "@/tests/fixtures/history";

const SAMPLE_HISTORY = linear(3);

describe("RepoAgentChrome mobile Graph | Agent tabs", () => {
  test("renders an accessible segmented tablist with Graph and Agent", () => {
    const html = renderToStaticMarkup(
      <RepoAgentChrome
        owner="octocat"
        repo="Hello-World"
        history={SAMPLE_HISTORY}
        desktopOpen={true}
        onDesktopOpenChange={() => {}}
      >
        <div>graph</div>
      </RepoAgentChrome>,
    );

    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="Graph or Agent"');
    expect(html).toContain('role="tab"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain(">Graph<");
    expect(html).toContain(">Agent<");
    expect(html).toContain("graph");
  });

  test("chrome CSS uses a single glass pill segment, not two bordered pills", async () => {
    const css = await Bun.file("components/agent/agent.module.css").text();
    expect(css).toContain(".chrome");
    expect(css).toContain(".tabSegment");
    expect(css).toMatch(/\.tabSegment\s*\{[^}]*border-radius:\s*var\(--radius-full\)/s);
    expect(css).toMatch(/\.tabSegment\s*\{[^}]*background-image:\s*var\(--glass-bg\)/s);
    expect(css).toMatch(/\.tabSegment\s*\{[^}]*backdrop-filter:\s*blur\(/s);
    expect(css).toMatch(/\.tabButton\s*\{[^}]*min-height:\s*var\(--touch-target\)/s);
    expect(css).toMatch(/\.tabButton\s*\{[^}]*border:\s*none/s);
    // Safe-area belongs to AppShell footer — tab bar must not double-pad it.
    expect(css).not.toMatch(/\.tabBar\s*\{[^}]*safe-area-inset-bottom/s);
  });

  test("tabs wire aria-controls to real tabpanels and support arrow keys", async () => {
    const source = await Bun.file("components/agent/RepoAgentChrome.tsx").text();
    expect(source).toContain('id="repo-panel-graph"');
    expect(source).toContain('id="repo-panel-agent"');
    expect(source).toContain('aria-controls="repo-panel-graph"');
    expect(source).toContain('aria-controls="repo-panel-agent"');
    expect(source).toContain('role="tabpanel"');
    expect(source).toContain("ArrowLeft");
    expect(source).toContain("ArrowRight");
  });

  test("collapsed desktop chrome has no floating FAB — dock only mounts when open", () => {
    const open = renderToStaticMarkup(
      <RepoAgentChrome
        owner="octocat"
        repo="Hello-World"
        history={SAMPLE_HISTORY}
        desktopOpen={true}
        onDesktopOpenChange={() => {}}
      >
        <div>graph</div>
      </RepoAgentChrome>,
    );
    expect(open).toContain('data-open="true"');
    expect(open).toContain("Minimize Agent");

    const closed = renderToStaticMarkup(
      <RepoAgentChrome
        owner="octocat"
        repo="Hello-World"
        history={SAMPLE_HISTORY}
        desktopOpen={false}
        onDesktopOpenChange={() => {}}
      >
        <div>graph</div>
      </RepoAgentChrome>,
    );
    expect(closed).not.toContain("desktopDock");
    expect(closed).not.toContain("Open Chronos Agent");
    expect(closed).not.toContain("desktopFab");
  });

  test("agent CSS no longer defines a floating desktop FAB", async () => {
    const css = await Bun.file("components/agent/agent.module.css").text();
    expect(css).not.toContain(".desktopFab");
    expect(css).not.toContain("agentFabIn");
  });
});
