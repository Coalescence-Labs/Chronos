import { describe, expect, test } from "bun:test";
import { agentGateMessage, evaluateAgentGate } from "@/lib/agent/gate";
import { agentJevModelId, agentSonnetModelId } from "@/lib/agent/models";
import { renderSafeAgentMarkdown, sanitizeAgentHtml } from "@/lib/agent/safe-markdown";

describe("agent models", () => {
  test("default Sonnet model uses a Vercel AI Gateway slug", () => {
    const previous = process.env.CHRONOS_AGENT_SONNET_MODEL;
    delete process.env.CHRONOS_AGENT_SONNET_MODEL;
    try {
      expect(agentSonnetModelId()).toBe("anthropic/claude-sonnet-5.5");
    } finally {
      if (previous === undefined) delete process.env.CHRONOS_AGENT_SONNET_MODEL;
      else process.env.CHRONOS_AGENT_SONNET_MODEL = previous;
    }
  });

  test("default Jev model uses a Vercel AI Gateway slug", () => {
    const previous = process.env.CHRONOS_AGENT_JEV_MODEL;
    delete process.env.CHRONOS_AGENT_JEV_MODEL;
    try {
      expect(agentJevModelId()).toBe("anthropic/claude-haiku-5.5");
    } finally {
      if (previous === undefined) delete process.env.CHRONOS_AGENT_JEV_MODEL;
      else process.env.CHRONOS_AGENT_JEV_MODEL = previous;
    }
  });
});

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
    expect(html).toContain("x");
  });

  test("renders headings, lists, and fenced code", () => {
    const html = renderSafeAgentMarkdown(
      ["## Tip", "", "- one", "- two", "", "```ts", "const n = 1;", "```"].join("\n"),
    );
    expect(html).toContain("<h2>Tip</h2>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain('<pre><code class="language-ts">');
    expect(html).toContain("const n = 1;");
  });

  test("strips raw HTML blocks from model output", () => {
    const html = renderSafeAgentMarkdown('Before <img src=x onerror="alert(1)"> after');
    expect(html).not.toContain("<img");
    expect(html).not.toContain("onerror");
    expect(html).toContain("Before");
    expect(html).toContain("after");
  });

  test("allows http(s) links with noopener", () => {
    const html = renderSafeAgentMarkdown("[docs](https://example.com/path)");
    expect(html).toContain('href="https://example.com/path"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('target="_blank"');
  });

  test("sanitizeAgentHtml strips disallowed tags and attrs", () => {
    const scrubbed = sanitizeAgentHtml(
      '<p onclick="evil()">ok</p><script>bad()</script><a href="javascript:1">x</a>',
    );
    expect(scrubbed).toContain("<p>ok</p>");
    expect(scrubbed).not.toContain("onclick");
    expect(scrubbed).not.toContain("<script>");
    expect(scrubbed).not.toContain("javascript:");
  });
});
