import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RepoAgentChrome } from "@/components/agent/RepoAgentChrome";
import { linear } from "@/tests/fixtures/history";

const SAMPLE_HISTORY = linear(3);

describe("RepoAgentChrome mobile Graph | Agent tabs", () => {
  test("renders an accessible segmented tablist with Graph and Agent", () => {
    const html = renderToStaticMarkup(
      <RepoAgentChrome owner="octocat" repo="Hello-World" history={SAMPLE_HISTORY}>
        <div>graph</div>
      </RepoAgentChrome>,
    );

    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="Graph or Agent"');
    expect(html).toContain('role="tab"');
    expect(html).toContain('aria-selected="true"');
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
    expect(css).toMatch(/\.tabButton\s*\{[^}]*min-height:\s*var\(--touch-target\)/s);
    expect(css).toMatch(/\.tabButton\s*\{[^}]*border:\s*none/s);
    // Safe-area belongs to AppShell footer — tab bar must not double-pad it.
    expect(css).not.toMatch(/\.tabBar\s*\{[^}]*safe-area-inset-bottom/s);
  });
});
