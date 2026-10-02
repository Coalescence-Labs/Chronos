import { GITHUB_OAUTH_SCOPES, githubOAuthClientId, githubOAuthClientSecret } from "./config";

const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const USER_URL = "https://api.github.com/user";

export function buildGitHubAuthorizeUrl(params: {
  state: string;
  redirectUri: string;
}): string {
  const clientId = githubOAuthClientId();
  if (!clientId) throw new Error("GITHUB_OAUTH_CLIENT_ID is not configured");

  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("scope", GITHUB_OAUTH_SCOPES.join(" "));
  url.searchParams.set("state", params.state);
  return url.toString();
}

export interface GitHubTokenExchange {
  accessToken: string;
  tokenType: string;
  scope: string;
}

/**
 * Exchange the OAuth code for an access token. Never logs the body.
 */
export async function exchangeGitHubCode(params: {
  code: string;
  redirectUri: string;
}): Promise<GitHubTokenExchange> {
  const clientId = githubOAuthClientId();
  const clientSecret = githubOAuthClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error("GitHub OAuth is not configured");
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "chronos-branch-graph",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code: params.code,
      redirect_uri: params.redirectUri,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("GitHub token exchange failed");
  }

  const body = (await response.json()) as {
    access_token?: string;
    token_type?: string;
    scope?: string;
    error?: string;
  };

  if (!body.access_token) {
    throw new Error(body.error ?? "GitHub token exchange returned no token");
  }

  return {
    accessToken: body.access_token,
    tokenType: body.token_type ?? "bearer",
    scope: body.scope ?? GITHUB_OAUTH_SCOPES.join(","),
  };
}

/** Fetch the authenticated GitHub login for disclosure UI. */
export async function fetchGitHubLogin(accessToken: string): Promise<string> {
  const response = await fetch(USER_URL, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "chronos-branch-graph",
    },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Failed to read GitHub user profile");
  }
  const body = (await response.json()) as { login?: string };
  if (!body.login) throw new Error("GitHub user profile missing login");
  return body.login;
}

export function createOAuthState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
