import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentPanel } from "@/components/agent/AgentPanel";
import { STARTER_SLOT_COUNT } from "@/lib/agent/starters/client-cache";
import { linear } from "@/tests/fixtures/history";

const SAMPLE_HISTORY = linear(3);

const SCOPE_LEAD =
  "Answers use commits already loaded in this view. Public repos only for now.";

describe("Agent panel UI", () => {
  test("empty state hierarchy: eyebrow, title, muted lead once, skeleton starters, no competing copy", () => {
    const html = renderToStaticMarkup(
      <AgentPanel owner="octocat" repo="Hello-World" history={SAMPLE_HISTORY} />,
    );

    expect(html).toContain("Chronos Agent");
    expect(html).toContain("Graph Q&amp;A");
    expect(html).toContain("Public beta");
    expect(html).toContain(SCOPE_LEAD);
    // Visible empty-state must not restate scope under a second title.
    expect(html).not.toContain("Ask about this graph</h3>");
    expect(html).not.toContain("no invented history");
    expect(html).not.toContain(">Question<");
    // First paint: reserved skeleton slots — not static fallbacks (avoids default→generated flash).
    expect(html).toContain('aria-label="Loading example questions"');
    expect(html).toContain('aria-busy="true"');
    expect(html.match(/data-skeleton-index="/g)?.length).toBe(STARTER_SLOT_COUNT);
    expect(html).not.toContain("Recent merges into main?");
    expect(html).not.toContain("Branches that share a parent?");
    // Thread empty-state is a prompt stack, not a message list.
    expect(html).not.toContain("messageList");
  });

  test("composer starts compact with Chronos Ask control and reserved footer facts band", () => {
    const html = renderToStaticMarkup(
      <AgentPanel owner="octocat" repo="Hello-World" history={SAMPLE_HISTORY} />,
    );
    expect(html).toContain("<textarea");
    expect(html).toContain('rows="1"');
    expect(html).toContain("Ask about this graph…");
    expect(html).toContain('aria-label="Ask"');
    expect(html).toContain(">Ask<");
    expect(html).not.toContain("Send question");
    expect(html).toContain("octocat/Hello-World");
    expect(html).toContain('aria-label="Graph context"');
    // Facts row is always mounted (empty) so focus/inspect does not grow the footer.
    expect(html).toContain('data-empty="true"');
    // No chat-precedent You/Agent meta chrome in the shell.
    expect(html).not.toContain("You ·");
    expect(html).not.toContain("Agent ·");
  });
});
