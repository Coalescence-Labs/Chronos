/** Sealed server-side GitHub App install binding — never sent to the client. */
export interface GitHubAppSessionData {
  /** GitHub App installation id — used to mint short-lived access tokens. */
  installationId: number;
  /** Account (user or org) that installed the App — for disclosure UI. */
  accountLogin: string;
  accountType: "User" | "Organization";
  /** WorkOS user id that completed connect — install ignored if mismatched. */
  workosUserId: string;
  connectedAt: string;
  /** Permission summary stored for UI disclosure (not used for authz). */
  permissions: string;
}

/** Public connection status — allowlisted fields only. */
export interface PublicGitHubConnection {
  connected: boolean;
  login: string | null;
  permissions: string | null;
  configured: boolean;
}
