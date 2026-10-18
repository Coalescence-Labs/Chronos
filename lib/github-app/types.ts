/** GitHub bindings and credentials — sealed, never readable by browser JS. */
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
  additionalInstallations?: GitHubInstallBinding[];
  /** GitHub user credentials, sealed in gh-session only; never in metadata/UI. */
  userAccessToken?: string;
  userRefreshToken?: string;
  userTokenExpiresAt?: number;
  authorizationVersion?: string;
}

export type GitHubInstallBinding = Pick<
  GitHubAppSessionData,
  "installationId" | "accountLogin" | "accountType" | "connectedAt" | "permissions"
>;

/** Public connection status — allowlisted fields only. */
export interface PublicGitHubConnection {
  connected: boolean;
  login: string | null;
  permissions: string | null;
  /** ISO timestamp of the install; null when unknown (pre-connectedAt sessions). */
  connectedAt: string | null;
  configured: boolean;
  state?: "connected" | "disconnected" | "reconnect-required" | "unavailable" | "disconnect-incomplete";
  accounts?: { login: string; accountType: "User" | "Organization"; connectedAt: string | null }[];
}
