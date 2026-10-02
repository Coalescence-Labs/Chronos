/** Sealed server-side GitHub OAuth material — never sent to the client. */
export interface GitHubOAuthSessionData {
  accessToken: string;
  tokenType: string;
  scope: string;
  login: string;
  /** WorkOS user id that completed connect — token ignored if mismatched. */
  workosUserId: string;
  connectedAt: string;
}

/** Public connection status — allowlisted fields only. */
export interface PublicGitHubConnection {
  connected: boolean;
  login: string | null;
  scope: string | null;
  configured: boolean;
}
