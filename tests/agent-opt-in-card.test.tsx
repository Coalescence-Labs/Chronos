import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentOptInCard } from "@/components/auth/AgentOptInCard";

describe("Agent opt-in card", () => {
  test("unconfigured deployments hide install actions and show unavailable copy", () => {
    const html = renderToStaticMarkup(
      <AgentOptInCard initialEnabled={false} configured={false} />,
    );
    expect(html).toContain("unavailable");
    expect(html).toContain("isn’t available in this deployment");
    expect(html).not.toContain("Turn on Agent");
    expect(html).not.toContain("ZDR");
    expect(html).not.toContain("% used");
  });

  test("development missing env names are listed without values", () => {
    const html = renderToStaticMarkup(
      <AgentOptInCard
        initialEnabled={false}
        configured={false}
        missingEnvVars={["AI_GATEWAY_API_KEY"]}
      />,
    );
    expect(html).toContain("AI_GATEWAY_API_KEY");
    expect(html).toContain("still needs to be set");
    expect(html).not.toContain("test-key");
  });

  test("configured card matches account disclosure and public-only scope", () => {
    const html = renderToStaticMarkup(
      <AgentOptInCard initialEnabled={false} configured={true} />,
    );
    expect(html).toContain("Turn on Agent");
    expect(html).toContain("Public repos for now");
    expect(html).toContain("public repos only for now");
    expect(html).not.toContain("ZDR");
    expect(html).not.toContain("% used");
  });

  test("enabled state uses the connected badge language", () => {
    const html = renderToStaticMarkup(
      <AgentOptInCard initialEnabled={true} configured={true} />,
    );
    expect(html).toContain('data-connected=""');
    expect(html).toContain("Turn off Agent");
    expect(html).not.toContain("Graph context only");
  });

  test("hides usage when spend ledger is not ready", () => {
    const html = renderToStaticMarkup(
      <AgentOptInCard
        initialEnabled={true}
        configured={true}
        usage={{ available: false }}
      />,
    );
    expect(html).not.toContain("% used");
    expect(html).not.toContain("Resets");
    expect(html).not.toContain("$");
  });

  test("shows minimal usage meter when opted in and spend is ready", () => {
    const html = renderToStaticMarkup(
      <AgentOptInCard
        initialEnabled={true}
        configured={true}
        usage={{
          available: true,
          percentUsed: 42,
          resetsAt: "2026-11-01T00:00:00.000Z",
        }}
      />,
    );
    expect(html).toContain("42% used");
    expect(html).toContain("Resets Nov 1");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain("aria-valuenow=\"42\"");
    expect(html).not.toContain("$");
    expect(html).not.toContain("monthly");
    expect(html).not.toContain("5 /");
  });

  test("hides usage while opted out even if spend snapshot is available", () => {
    const html = renderToStaticMarkup(
      <AgentOptInCard
        initialEnabled={false}
        configured={true}
        usage={{
          available: true,
          percentUsed: 10,
          resetsAt: "2026-11-01T00:00:00.000Z",
        }}
      />,
    );
    expect(html).not.toContain("% used");
    expect(html).toContain("Graph context only");
  });
});
