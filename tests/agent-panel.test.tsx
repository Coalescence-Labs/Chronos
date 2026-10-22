import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentPanel } from "@/components/agent/AgentPanel";
import { EMPTY_HISTORY } from "@/tests/fixtures/history";

describe("Agent panel UI", () => {
  test("empty state offers starters without legacy Ask form", () => {
    const html = renderToStaticMarkup(
      <AgentPanel owner="octocat" repo="Hello-World" history={EMPTY_HISTORY} />,
    );
    expect(html).toContain("Ask about this graph");
    expect(html).toContain("What merged recently?");
    expect(html).not.toContain(">Question<");
    expect(html).not.toContain(">Ask<");
  });

  test("composer uses an accessible textarea and Send control", () => {
    const html = renderToStaticMarkup(
      <AgentPanel owner="octocat" repo="Hello-World" history={EMPTY_HISTORY} />,
    );
    expect(html).toContain("<textarea");
    expect(html).toContain("Send message");
    expect(html).toContain("Send");
  });
});
