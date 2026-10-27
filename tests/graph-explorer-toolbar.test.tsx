import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { GraphExplorer } from "@/components/repo/GraphExplorer";
import { linear } from "@/tests/fixtures/history";

const SAMPLE_HISTORY = linear(8);

describe("GraphExplorer header toolbar", () => {
  test("actions order is Agent (when collapsed) → Glance → Refresh", () => {
    // Default mount opens Agent; collapsed control is absent until minimize.
    // Assert source order in the actions cluster so the layout contract is locked.
    const source = Bun.file("components/repo/GraphExplorer.tsx");
    return source.text().then((text) => {
      const actions = text.slice(text.indexOf("styles.actions"), text.indexOf("</div>", text.indexOf("styles.actions") + 200) + 200);
      const agentAt = actions.indexOf("agentToggle");
      const glanceAt = actions.indexOf("glanceToggle");
      const refreshAt = actions.indexOf("refreshButton");
      expect(agentAt).toBeGreaterThan(-1);
      expect(glanceAt).toBeGreaterThan(agentAt);
      expect(refreshAt).toBeGreaterThan(glanceAt);
    });
  });

  test("renders Glance and Refresh peers; Agent header control only when minimized", () => {
    const open = renderToStaticMarkup(
      <GraphExplorer owner="octocat" repo="Hello-World" history={SAMPLE_HISTORY} onRefresh={() => {}} />,
    );
    expect(open).toContain(">Glance<");
    expect(open).toContain("Refresh — re-sync branch tips");
    // Desktop Agent starts open — header collapsed control is not mounted.
    expect(open).not.toContain('aria-label="Open Chronos Agent"');
    expect(open).toContain("Minimize Agent");
  });

  test("agent toggle CSS is a glass peer of Glance at touch size (desktop only)", async () => {
    const css = await Bun.file("components/repo/repo.module.css").text();
    expect(css).toMatch(/\.agentToggle\s*\{[^}]*min-height:\s*var\(--touch-target\)/s);
    expect(css).toMatch(/\.agentToggle\s*\{[^}]*background-image:\s*var\(--glass-bg\)/s);
    expect(css).toMatch(/\.agentToggle\s*\{[^}]*display:\s*none/s);
    expect(css).toMatch(
      /@media\s*\(min-width:\s*701px\)\s*\{[^}]*\.agentToggle\s*\{[^}]*display:\s*inline-flex/s,
    );
  });

  test("zoom controls sit bottom-right with no Agent-dock clearance offset", async () => {
    const css = await Bun.file("components/graph/graph.module.css").text();
    expect(css).toMatch(/\.zoomControls\s*\{[^}]*right:\s*var\(--space-3\)/s);
    expect(css).toMatch(/\.zoomControls\s*\{[^}]*bottom:\s*var\(--space-3\)/s);
    expect(css).not.toContain("Clear the Agent desktop dock");
    expect(css).not.toMatch(/min\(400px/);
  });
});
