import { githubAppId, githubAppSlug } from "./config";
import { createGitHubAppJwt } from "./jwt";
import type { RepoId } from "@/lib/ingest/github/parse";
import { githubFetch, githubResponseError } from "./http";

const API_VERSION = "2022-11-28";
const USER_AGENT = "chronos-branch-graph";

export function createInstallState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Redirect the user to install (or configure) the Chronos GitHub App. */
export function buildGitHubAppInstallUrl(params: { state: string }): string {
  const slug = githubAppSlug();
  if (!slug) throw new Error("GITHUB_APP_SLUG is not configured");

  const url = new URL(`https://github.com/apps/${slug}/installations/new`);
  url.searchParams.set("state", params.state);
  return url.toString();
}

export interface InstallationAccount {
  installationId: number;
  accountLogin: string;
  accountType: "User" | "Organization";
}

/** Thrown when GitHub rejects an installation lookup (includes HTTP status). */
export class GitHubInstallationReadError extends Error {
  readonly status: number;

  constructor(status: number) {
    super("Failed to read GitHub App installation");
    this.name = "GitHubInstallationReadError";
    this.status = status;
  }
}

/**
 * Read installation metadata with an App JWT. Never logs the response body.
 */
export async function fetchInstallationAccount(
  installationId: number,
): Promise<InstallationAccount> {
  const jwt = createGitHubAppJwt();
  const response = await githubFetch(
    `https://api.github.com/app/installations/${installationId}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${jwt}`,
        "X-GitHub-Api-Version": API_VERSION,
        "User-Agent": USER_AGENT,
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new GitHubInstallationReadError(response.status);
  }

  const body = (await response.json()) as {
    id?: number;
    account?: { login?: string; type?: string };
  };

  const login = body.account?.login;
  const type = body.account?.type;
  if (body.id !== installationId || !login || (type !== "User" && type !== "Organization")) {
    throw new Error("GitHub App installation missing account");
  }

  return {
    installationId: body.id,
    accountLogin: login,
    accountType: type,
  };
}

/**
 * Mint a short-lived installation access token (≈1h). Server-only.
 */
const installationTokens = new Map<string, { expires: number; promise: Promise<string> }>();

export function createInstallationAccessToken(installationId: number, repo?: RepoId): Promise<string> {
  if (!repo) return mintInstallationAccessToken(installationId);
  const now = Date.now();
  for (const [key, entry] of installationTokens) if (entry.expires <= now) installationTokens.delete(key);
  const key = `${githubAppId()}:${installationId}:${repo.repo.toLowerCase()}`;
  const existing = installationTokens.get(key);
  if (existing) return existing.promise;
  if (installationTokens.size >= 256) installationTokens.delete(installationTokens.keys().next().value!);
  const entry = { expires: now + 12_000, promise: Promise.resolve("") };
  entry.promise = mintInstallationAccessToken(installationId, repo, (expires) => { entry.expires = expires; })
    .catch((error: unknown) => { installationTokens.delete(key); throw error; });
  installationTokens.set(key, entry);
  return entry.promise;
}

async function mintInstallationAccessToken(
  installationId: number,
  repo?: RepoId,
  setExpiry?: (expires: number) => void,
): Promise<string> {
  const jwt = createGitHubAppJwt();
  const response = await githubFetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      body: JSON.stringify({
        permissions: { contents: "read", metadata: "read" },
        ...(repo ? { repositories: [repo.repo] } : {}),
      }),
      headers: {
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
        "X-GitHub-Api-Version": API_VERSION,
        "User-Agent": USER_AGENT,
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw await githubResponseError(response);
  }

  const body = (await response.json()) as { token?: string; expires_at?: string };
  if (!body.token) {
    throw new Error("GitHub installation token response missing token");
  }
  const expires = Date.parse(body.expires_at ?? "");
  setExpiry?.(Number.isFinite(expires) ? Math.min(Date.now() + 55 * 60_000, expires - 60_000) : 0);
  return body.token;
}

/**
 * Uninstall the App for this installation (best-effort on Disconnect).
 * GitHub may also require the user to revoke from github.com settings.
 */
export async function deleteInstallation(
  installationId: number,
): Promise<boolean> {
  const jwt = createGitHubAppJwt();
  const response = await githubFetch(
    `https://api.github.com/app/installations/${installationId}`,
    {
      method: "DELETE",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${jwt}`,
        "X-GitHub-Api-Version": API_VERSION,
        "User-Agent": USER_AGENT,
      },
      cache: "no-store",
    },
  );
  // 204 success; 404 already gone — both fine for disconnect.
  return response.ok || response.status === 404;
}
