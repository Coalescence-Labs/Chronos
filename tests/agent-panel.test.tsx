import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentPanel } from "@/components/agent/AgentPanel";
import { withHead } from "@/tests/fixtures/history";

const FIXTURE_HISTORY = withHead([]);

describe("Agent panel UI", () => {
  test("empty state offers compact starters and beta scope tooltip without legacy Ask form", () => {
    const html = renderToStaticMarkup(
      <AgentPanel owner="octocat" repo="Hello-World" history={FIXTURE_HISTORY} />,
    );
    expect(html).toContain("Graph Q&amp;A");
    expect(html).toContain("Public beta");
    expect(html).toContain('role="tooltip"');
    expect(html).toContain("Public repos only for now");
    expect(html).toContain("Recent merges into default?");
    expect(html).not.toContain("Start here");
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

  test("shows focused branch stamp when graph trace is active", () => {
    const html = renderToStaticMarkup(
      <AgentPanel
        owner="octocat"
        repo="Hello-World"
        history={FIXTURE_HISTORY}
        focusedBranch={{ name: "main", tipSha: "abc1234" }}
      />,
    );
    expect(html).toContain("focused:");
    expect(html).toContain("main");
  });
});
