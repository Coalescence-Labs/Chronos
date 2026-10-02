import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { GitHubConnectionCard } from "@/components/auth/GitHubConnectionCard";
import type { PublicGitHubConnection } from "@/lib/github-app/types";

const NOT_CONNECTED: PublicGitHubConnection = {
  connected: false,
  login: null,
  permissions: null,
  connectedAt: null,
  configured: true,
};

const CONNECTED: PublicGitHubConnection = {
  connected: true,
  login: "ada",
  permissions: "contents:read,metadata:read",
  connectedAt: "2026-10-01T12:00:00.000Z",
  configured: true,
};

const CONSENT_CLAIMS = [
  "Read-only access",
  "Repos you choose",
  "No repo data stored",
  "Encrypted session",
  "Revoke anytime",
];

describe("GitHub connection card (COA-202)", () => {
  test("before install, every consent fact is visible — not collapsed (PRIVACY.md #5)", () => {
    const html = renderToStaticMarkup(<GitHubConnectionCard connection={NOT_CONNECTED} />);
    expect(html).toContain("Install GitHub App");
    expect(html).toContain('href="/api/github/connect"');
    expect(html).toContain("not connected");
    expect(html).not.toContain("<details");
    for (const claim of CONSENT_CLAIMS) expect(html).toContain(claim);
    expect(html).toContain("Contents and metadata");
    expect(html).toContain("https://github.com/settings/installations");
  });

  test("connected collapses the facts and offers disconnect + repo selection", () => {
    const html = renderToStaticMarkup(<GitHubConnectionCard connection={CONNECTED} />);
    expect(html).toContain("@ada");
    expect(html).toContain("since 2026-10-01");
    expect(html).toContain("Disconnect");
    expect(html).toContain("Change repos");
    expect(html).not.toContain("Install GitHub App");
    const details = html.indexOf("<details");
    expect(details).toBeGreaterThan(-1);
    expect(html.indexOf("Read-only access")).toBeGreaterThan(details);
  });

  test("connected without a known date omits the since segment", () => {
    const html = renderToStaticMarkup(
      <GitHubConnectionCard connection={{ ...CONNECTED, connectedAt: null }} />,
    );
    expect(html).toContain("@ada");
    expect(html).not.toContain("since");
  });

  test("unconfigured environments show setup guidance and no install action", () => {
    const html = renderToStaticMarkup(
      <GitHubConnectionCard connection={{ ...NOT_CONNECTED, configured: false }} />,
    );
    expect(html).toContain("unavailable");
    expect(html).toContain("GITHUB_SESSION_PASSWORD");
    expect(html).not.toContain("/api/github/connect");
  });

  test("status banners match the card state and are dismissible", () => {
    const connected = renderToStaticMarkup(
      <GitHubConnectionCard connection={CONNECTED} status="connected" />,
    );
    expect(connected).toContain("Connected. Repos you selected will now load.");
    expect(connected).toContain('href="/account"');

    const stale = renderToStaticMarkup(
      <GitHubConnectionCard connection={NOT_CONNECTED} status="connected" />,
    );
    expect(stale).not.toContain("Repos you selected will now load");

    const error = renderToStaticMarkup(
      <GitHubConnectionCard connection={NOT_CONNECTED} status="error" />,
    );
    expect(error).toContain('role="alert"');

    const unknown = renderToStaticMarkup(
      <GitHubConnectionCard connection={NOT_CONNECTED} status="bogus" />,
    );
    expect(unknown).not.toContain('role="status"');
    expect(unknown).not.toContain('role="alert"');
  });
});
