import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AGENT_RIPPLE_MS_PER_CHAR,
  AGENT_RIPPLE_TRANSITION_MS,
  AgentRippleText,
} from "@/components/agent/RippleText";

describe("AgentRippleText", () => {
  test("ships owner timing: 10ms per character, 140ms transition", () => {
    expect(AGENT_RIPPLE_MS_PER_CHAR).toBe(10);
    expect(AGENT_RIPPLE_TRANSITION_MS).toBe(140);
  });

  test("renders accessible label for the full string", () => {
    const html = renderToStaticMarkup(<AgentRippleText text="Graph tip" active />);
    expect(html).toContain('aria-label="Graph tip"');
  });
});
