import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentPanel } from "@/components/agent/AgentPanel";
import { withHead } from "@/tests/fixtures/history";

const FIXTURE_HISTORY = withHead([]);

describe("Agent panel UI", () => {
  test("empty state offers starters and public-beta copy without legacy Ask form", () => {
    const html = renderToStaticMarkup(
      <AgentPanel owner="octocat" repo="Hello-World" history={FIXTURE_HISTORY} />,
    );
    expect(html).toContain("Ask about this graph");
    expect(html).toContain("Public beta");
    expect(html).toContain("public repos only for now");
    expect(html).toContain("What merged into the default branch recently?");
    expect(html).not.toContain("ZDR");
    expect(html).not.toContain(">Question<");
    expect(html).not.toContain(">Ask<");
  });

  test("composer uses an accessible textarea and send control", () => {
    const html = renderToStaticMarkup(
      <AgentPanel owner="octocat" repo="Hello-World" history={FIXTURE_HISTORY} />,
    );
    expect(html).toContain("<textarea");
    expect(html).toContain("Send question");
    expect(html).toContain("octocat/Hello-World");
  });
});
