import { describe, expect, test } from "bun:test";
import { agentGateMessage, evaluateAgentGate } from "@/lib/agent/gate";
import { renderSafeAgentMarkdown } from "@/lib/agent/safe-markdown";

describe("agent gate", () => {
  test("blocks when kill switch is active", async () => {
    const previous = process.env.CHRONOS_AGENT_KILL_SWITCH;
    process.env.CHRONOS_AGENT_KILL_SWITCH = "1";
    process.env.AI_GATEWAY_API_KEY = "test-key";
    try {
      const result = await evaluateAgentGate("user_123");
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("kill-switch");
      expect(agentGateMessage(result.reason)).toContain("unavailable");
    } finally {
      if (previous === undefined) delete process.env.CHRONOS_AGENT_KILL_SWITCH;
      else process.env.CHRONOS_AGENT_KILL_SWITCH = previous;
      delete process.env.AI_GATEWAY_API_KEY;
    }
  });
});

describe("safe agent markdown", () => {
  test("escapes script tags and keeps bold/code", () => {
    const html = renderSafeAgentMarkdown('Hello **world** `<script>alert(1)</script>`');
    expect(html).toContain("<strong>world</strong>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  test("drops unsafe link protocols", () => {
    const html = renderSafeAgentMarkdown("[x](javascript:alert(1))");
    expect(html).not.toContain("javascript:");
  });
});
