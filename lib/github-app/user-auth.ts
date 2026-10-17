import { sealData, unsealData } from "iron-session";
import {
  githubAppClientId,
  githubAppClientSecret,
  githubSessionPassword,
} from "./config";
import type { GitHubAppSessionData } from "./types";

export interface GitHubConnectState {
  state: string;
  workosUserId: string;
  stage: "install" | "authorize";
  redirectUri: string;
  installationId?: number;
}

export async function sealGitHubConnectState(state: GitHubConnectState): Promise<string> {
  return sealData(state, { password: githubSessionPassword()!, ttl: 600 });
}

export async function readGitHubConnectState(value: string | undefined): Promise<Partial<GitHubConnectState>> {
  if (!value) return {};
  return unsealData<GitHubConnectState>(value, { password: githubSessionPassword()!, ttl: 600 });
}

export function buildGitHubUserAuthorizeUrl(state: GitHubConnectState): string {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", githubAppClientId()!);
  url.searchParams.set("redirect_uri", state.redirectUri);
  url.searchParams.set("state", state.state);
  return url.toString();
}

export type GitHubUserCredentials = Pick<
  GitHubAppSessionData, "userAccessToken" | "userRefreshToken" | "userTokenExpiresAt"
>;

async function exchangeUserCredentials(params: Record<string, string>): Promise<GitHubUserCredentials> {
  const clientId = githubAppClientId();
  const clientSecret = githubAppClientSecret();
  if (!clientId || !clientSecret) throw new Error("GitHub user authorization is not configured");
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, ...params }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("GitHub user authorization failed");
  const body = await response.json() as {
    access_token?: string; refresh_token?: string; expires_in?: number;
  };
  if (!body.access_token) throw new Error("GitHub user authorization returned no token");
  return {
    userAccessToken: body.access_token,
    userRefreshToken: body.refresh_token,
    userTokenExpiresAt: body.expires_in ? Date.now() + body.expires_in * 1000 : undefined,
  };
}

export function exchangeGitHubUserCode(code: string, redirectUri: string): Promise<GitHubUserCredentials> {
  return exchangeUserCredentials({ code, redirect_uri: redirectUri });
}

export function refreshGitHubUserToken(refreshToken: string): Promise<GitHubUserCredentials> {
  return exchangeUserCredentials({ grant_type: "refresh_token", refresh_token: refreshToken });
}

/** Verify the returned installation id against the authenticated GitHub user. */
export async function assertGitHubUserInstallation(accessToken: string, installationId: number): Promise<void> {
  for (let page = 1; page <= 100; page++) {
    const response = await fetch(`https://api.github.com/user/installations?per_page=100&page=${page}`, {
      headers: {
        Accept: "application/vnd.github+json", Authorization: `Bearer ${accessToken}`,
        "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "chronos-branch-graph",
      },
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Could not verify GitHub installation access");
    const body = await response.json() as { installations?: { id: number; suspended_at?: string | null }[] };
    if (body.installations?.some((installation) => installation.id === installationId && !installation.suspended_at)) return;
    if (!response.headers.get("link")?.includes('rel="next"')) break;
  }
  throw new Error("GitHub installation is not accessible to this user");
}
