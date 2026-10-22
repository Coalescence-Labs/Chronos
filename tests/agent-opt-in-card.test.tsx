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
  });

  test("enabled state uses the connected badge language", () => {
    const html = renderToStaticMarkup(
      <AgentOptInCard initialEnabled={true} configured={true} />,
    );
    expect(html).toContain('data-connected=""');
    expect(html).toContain("Turn off Agent");
    expect(html).not.toContain("Graph context only");
  });
});
