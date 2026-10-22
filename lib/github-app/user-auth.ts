import { sealData, unsealData } from "iron-session";
import {
  githubAppClientId,
  githubAppClientSecret,
  githubSessionPassword,
} from "./config";
import type { GitHubAppSessionData } from "./types";
import { createHash, randomBytes } from "node:crypto";
import { githubFetch, githubResponseError } from "./http";
import { IngestError } from "@/lib/ingest/errors";

export interface GitHubConnectState {
  state: string;
  workosUserId: string;
  stage: "install" | "authorize";
  redirectUri: string;
  installationId?: number;
  codeVerifier?: string;
  authorizationVersion?: string;
}

export function createGitHubCodeVerifier(): string { return randomBytes(32).toString("base64url"); }

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
  url.searchParams.set("scope", "offline_access");
  if (state.codeVerifier) {
    url.searchParams.set("code_challenge", createHash("sha256").update(state.codeVerifier).digest("base64url"));
    url.searchParams.set("code_challenge_method", "S256");
  }
  return url.toString();
}

export type GitHubUserCredentials = Pick<
  GitHubAppSessionData, "userAccessToken" | "userRefreshToken" | "userTokenExpiresAt"
>;

async function exchangeUserCredentials(params: Record<string, string>): Promise<GitHubUserCredentials> {
  const clientId = githubAppClientId();
  const clientSecret = githubAppClientSecret();
  if (!clientId || !clientSecret) throw new Error("GitHub user authorization is not configured");
  const response = await githubFetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, ...params }),
    cache: "no-store",
  });
  if (!response.ok && response.status !== 400) throw await githubResponseError(response);
  const body = await response.json() as {
    access_token?: string; refresh_token?: string; expires_in?: number; error?: string;
  };
  if (typeof body.access_token !== "string" || !body.access_token) {
    if (params.grant_type === "refresh_token" && /bad_refresh_token|invalid_grant/.test(body.error ?? "")) {
      throw new IngestError("auth-refreshing", "GitHub authorization needs to be refreshed. Retry shortly, or reconnect GitHub if this continues.", 1);
    }
    throw new IngestError("reconnect-required", "GitHub authorization failed. Reconnect GitHub in your account.");
  }
  if (!response.ok || typeof body.expires_in !== "number" || !Number.isFinite(body.expires_in) || body.expires_in <= 0 ||
    (body.refresh_token !== undefined && typeof body.refresh_token !== "string")) {
    throw new IngestError("reconnect-required", "GitHub returned invalid authorization credentials. Please reconnect GitHub.");
  }
  return {
    userAccessToken: body.access_token,
    userRefreshToken: body.refresh_token,
    userTokenExpiresAt: body.expires_in ? Date.now() + body.expires_in * 1000 : undefined,
  };
}

export function exchangeGitHubUserCode(code: string, redirectUri: string, verifier?: string): Promise<GitHubUserCredentials> {
  return exchangeUserCredentials({ code, redirect_uri: redirectUri, ...(verifier ? { code_verifier: verifier } : {}) });
}

export function refreshGitHubUserToken(refreshToken: string): Promise<GitHubUserCredentials> {
  return exchangeUserCredentials({ grant_type: "refresh_token", refresh_token: refreshToken });
}

/** Verify the returned installation id against the authenticated GitHub user. */
export async function assertGitHubUserInstallation(accessToken: string, installationId: number, additionalIds: number[] = []): Promise<void> {
  const missing = new Set([installationId, ...additionalIds]);
  const signal = AbortSignal.timeout(20_000);
  for (let page = 1; page <= 100; page++) {
    const response = await githubFetch(`https://api.github.com/user/installations?per_page=100&page=${page}`, {
      headers: {
        Accept: "application/vnd.github+json", Authorization: `Bearer ${accessToken}`,
        "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "chronos-branch-graph",
      },
      cache: "no-store",
      signal,
    });
    if (!response.ok) throw await githubResponseError(response);
    const body = await response.json() as { installations?: { id: number; suspended_at?: string | null }[] };
    for (const installation of body.installations ?? []) if (!installation.suspended_at) missing.delete(installation.id);
    if (!missing.size) return;
    if (!response.headers.get("link")?.includes('rel="next"')) break;
  }
  throw new IngestError("access-denied", "GitHub installation is not accessible to this user. Use the GitHub account with access to your saved installations, and check organization approval.");
}

export async function revokeGitHubUserGrant(accessToken: string): Promise<void> {
  const response = await githubFetch(`https://api.github.com/applications/${githubAppClientId()}/grant`, {
    method: "DELETE",
    headers: { Accept: "application/vnd.github+json", "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${githubAppClientId()}:${githubAppClientSecret()}`).toString("base64")}` },
    body: JSON.stringify({ access_token: accessToken }),
  });
  if (!response.ok) throw await githubResponseError(response);
}
