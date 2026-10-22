import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentPanel } from "@/components/agent/AgentPanel";
import { linear } from "@/tests/fixtures/history";

const SAMPLE_HISTORY = linear(3);

describe("Agent panel UI", () => {
  test("empty state offers starters and public-beta copy", () => {
    const html = renderToStaticMarkup(
      <AgentPanel owner="octocat" repo="Hello-World" history={SAMPLE_HISTORY} />,
    );
    expect(html).toContain("Public beta");
    expect(html).toContain("Recent merges into default?");
    expect(html).not.toContain(">Question<");
    expect(html).not.toContain(">Ask<");
  });

  test("composer uses an accessible textarea and icon send control", () => {
    const html = renderToStaticMarkup(
      <AgentPanel owner="octocat" repo="Hello-World" history={SAMPLE_HISTORY} />,
    );
    expect(html).toContain("<textarea");
    expect(html).toContain("Send question");
  });
});
