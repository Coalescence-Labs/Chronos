/**
 * GitHub repo OAuth (COA-202) — distinct from WorkOS "Sign in with GitHub".
 * Decision #7 BFF: token never reaches browser JS.
 *
 * Scopes (reversible until owner ratifies):
 * - `read:user` — display which GitHub identity is connected
 * - `repo` — private-repo read (GitHub classic OAuth has no narrower private
 *   read scope; `repo` includes write capability Chronos never exercises)
 */

/** 7 days — matches WorkOS sealed-session preference. */
export const GITHUB_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export const GITHUB_OAUTH_SCOPES = ["read:user", "repo"] as const;

export const GITHUB_COOKIE_POSTURE = {
  httpOnly: true,
  secureInProduction: true,
  sameSite: "lax" as const,
  recommendedMaxAgeSeconds: GITHUB_SESSION_MAX_AGE_SECONDS,
  defaultName: "gh-session",
  stateCookieName: "gh-oauth-state",
} as const;

export function githubOAuthClientId(): string | undefined {
  return process.env.GITHUB_OAUTH_CLIENT_ID?.trim() || undefined;
}

export function githubOAuthClientSecret(): string | undefined {
  return process.env.GITHUB_OAUTH_CLIENT_SECRET?.trim() || undefined;
}

export function githubSessionPassword(): string | undefined {
  const value = process.env.GITHUB_SESSION_PASSWORD?.trim();
  return value && value.length >= 32 ? value : undefined;
}

/**
 * Callback must match the GitHub OAuth App setting exactly.
 * Default: derive from the request origin at runtime when unset.
 */
export function githubOAuthCallbackUrl(origin: string): string {
  const configured = process.env.GITHUB_OAUTH_CALLBACK_URL?.trim();
  if (configured) return configured;
  return `${origin.replace(/\/$/, "")}/api/github/callback`;
}

/** Optional shared app token for anonymous public paste (rate-limit pool). */
export function githubAppPoolToken(): string | undefined {
  return process.env.GITHUB_TOKEN?.trim() || undefined;
}

export function isGitHubOAuthConfigured(): boolean {
  return Boolean(
    githubOAuthClientId() && githubOAuthClientSecret() && githubSessionPassword(),
  );
}
