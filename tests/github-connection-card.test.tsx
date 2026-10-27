import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  GitHubConnectionCard,
  GitHubConnectionCardPending,
} from "@/components/auth/GitHubConnectionCard";
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
    expect(html).toContain("https://github.com/settings/apps/authorizations");
  });

  test("connected collapses the facts and offers disconnect + repo selection", () => {
    const html = renderToStaticMarkup(<GitHubConnectionCard connection={CONNECTED} />);
    expect(html).toContain("@ada");
    expect(html.replace(/<[^>]+>/g, "")).toContain("since 2026-10-01");
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

  test("personal and organization connections remain visible with an add action", () => {
    const html = renderToStaticMarkup(<GitHubConnectionCard connection={{
      ...CONNECTED,
      accounts: [
        { login: "ada", accountType: "User", connectedAt: CONNECTED.connectedAt },
        { login: "acme", accountType: "Organization", connectedAt: null },
      ],
    }} />);
    expect(html).toContain("@ada");
    expect(html).toContain("@acme");
    expect(html).toContain("Add organization");
    expect(html).toContain("Disconnect all");
    expect(html).toContain("installations stay on GitHub");
  });

  test("saved installations without user authorization offer reconnect", () => {
    const html = renderToStaticMarkup(<GitHubConnectionCard connection={{ ...CONNECTED, connected: false }} />);
    expect(html).toContain("Reconnect GitHub");
    expect(html).toContain("Check organization approval and SSO");
    expect(html).not.toContain("Install GitHub App");
    expect(html).toContain("Disconnect");
  });

  test("a stale session without a login still offers disconnect recovery", () => {
    const html = renderToStaticMarkup(<GitHubConnectionCard connection={{ ...NOT_CONNECTED, state: "reconnect-required" }} status="access-denied" />);
    expect(html).toContain("Reconnect GitHub");
    expect(html).toContain("Disconnect all");
    expect(html).toContain("selected installation");
  });

  test("an inaccessible saved account is labeled without hiding healthy connections", () => {
    const html = renderToStaticMarkup(<GitHubConnectionCard connection={{
      ...CONNECTED,
      accounts: [
        { login: "ada", accountType: "User", connectedAt: CONNECTED.connectedAt, connected: true },
        { login: "acme", accountType: "Organization", connectedAt: null, connected: false },
      ],
    }} />);
    expect(html).toContain("@ada"); expect(html).toContain("@acme");
    expect(html).toContain("reconnect required");
    expect(html).toContain("Some saved accounts need reconnecting");
    expect(html).toContain("Disconnect all");
  });

  test("a provider outage offers a check without suggesting a new connection", () => {
    const html = renderToStaticMarkup(<GitHubConnectionCard connection={{ ...NOT_CONNECTED, state: "unavailable" }} onRetry={() => {}} />);
    expect(html).toContain("Retry check");
    expect(html).not.toContain("Install GitHub App");
    expect(html).not.toContain("Disconnect");
  });

  test("an interrupted disconnect offers recovery while private access stays blocked", () => {
    const html = renderToStaticMarkup(<GitHubConnectionCard connection={{ ...NOT_CONNECTED, state: "disconnect-incomplete" }} />);
    expect(html).toContain("Disconnect all");
    expect(html).toContain("Private access is blocked");
    expect(html).not.toContain("Retry check");
    expect(html).not.toContain("/api/github/connect");
  });

  test("an organization approval request is distinct from a successful connection", () => {
    const html = renderToStaticMarkup(<GitHubConnectionCard connection={CONNECTED} status="pending" />);
    expect(html).toContain("Organization access requested");
    expect(html).not.toContain("Repos you selected will now load");
  });

  test("unconfigured environments show setup guidance and no install action", () => {
    const html = renderToStaticMarkup(
      <GitHubConnectionCard connection={{ ...NOT_CONNECTED, configured: false }} />,
    );
    expect(html).toContain("unavailable");
    expect(html).toContain("aren’t available in this deployment");
    expect(html).not.toContain("/api/github/connect");
  });

  test("development missing env names render as dev-only hints", () => {
    const html = renderToStaticMarkup(
      <GitHubConnectionCard
        connection={{
          ...NOT_CONNECTED,
          configured: false,
          missingEnvVars: ["GITHUB_APP_SLUG", "GITHUB_APP_ID"],
        }}
      />,
    );
    expect(html).toContain("GITHUB_APP_SLUG");
    expect(html).toContain("still needs to be set");
    expect(html).not.toContain("ghp_");
  });

  test("pending state is distinct from disconnected (rehydrate in flight)", () => {
    const html = renderToStaticMarkup(<GitHubConnectionCardPending />);
    expect(html).toContain("checking");
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain("not connected");
    expect(html).not.toContain("Install GitHub App");
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
