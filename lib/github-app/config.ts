/**
 * GitHub App connect (COA-202) — distinct from WorkOS "Sign in with GitHub".
 * Decision #7 BFF: installation id sealed server-side; short-lived installation
 * tokens minted with the App private key. Never exposed to browser JS.
 *
 * Permissions (owner-ratified): Contents: Read, Metadata: Read — truly read-only.
 * Webhooks not required for v1 connect-only.
 */

/** 7 days — matches WorkOS sealed-session preference. */
export const GITHUB_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

/** App permission grants Chronos requests (GitHub App settings must match). */
export const GITHUB_APP_PERMISSIONS = [
  "contents:read",
  "metadata:read",
] as const;

export const GITHUB_COOKIE_POSTURE = {
  httpOnly: true,
  secureInProduction: true,
  sameSite: "lax" as const,
  recommendedMaxAgeSeconds: GITHUB_SESSION_MAX_AGE_SECONDS,
  defaultName: "gh-session",
  stateCookieName: "gh-app-state",
} as const;

export function githubAppId(): string | undefined {
  return process.env.GITHUB_APP_ID?.trim() || undefined;
}

export function githubAppSlug(): string | undefined {
  return process.env.GITHUB_APP_SLUG?.trim() || undefined;
}

export function githubAppClientId(): string | undefined {
  return process.env.GITHUB_APP_CLIENT_ID?.trim() || undefined;
}

export function githubAppClientSecret(): string | undefined {
  const value = process.env.GITHUB_APP_CLIENT_SECRET?.trim();
  if (!value) return undefined;
  // OAuth client secrets are short opaque strings — PEM belongs in GITHUB_APP_PRIVATE_KEY.
  if (value.includes("BEGIN") || value.length > 256) return undefined;
  return value;
}

/**
 * PEM private key. Env often stores newlines as `\n` — normalize before use.
 */
export function githubAppPrivateKey(): string | undefined {
  const raw = process.env.GITHUB_APP_PRIVATE_KEY?.trim();
  if (!raw) return undefined;
  const pem = raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
  return pem.includes("BEGIN") ? pem : undefined;
}

export function githubSessionPassword(): string | undefined {
  const value = process.env.GITHUB_SESSION_PASSWORD?.trim();
  return value && value.length >= 32 ? value : undefined;
}

/**
 * Setup / callback URL after install. Must match the GitHub App "Setup URL"
 * (or Callback URL). Default: `{origin}/api/github/callback`.
 */
export function githubAppSetupUrl(origin: string): string {
  const configured = process.env.GITHUB_APP_SETUP_URL?.trim();
  if (configured) return configured;
  return `${origin.replace(/\/$/, "")}/api/github/callback`;
}

/** Optional shared app token for anonymous public paste (rate-limit pool). */
export function githubAppPoolToken(): string | undefined {
  return process.env.GITHUB_TOKEN?.trim() || undefined;
}

export function isGitHubAppConfigured(): boolean {
  return githubAppMissingEnvVarNames().length === 0;
}

/** Required GitHub App env var names that are unset or invalid (values never returned). */
export function githubAppMissingEnvVarNames(): string[] {
  const missing: string[] = [];
  if (!githubAppId()) missing.push("GITHUB_APP_ID");
  if (!githubAppSlug()) missing.push("GITHUB_APP_SLUG");
  if (!githubAppClientId()) missing.push("GITHUB_APP_CLIENT_ID");
  if (!githubAppClientSecret()) missing.push("GITHUB_APP_CLIENT_SECRET");
  if (!githubAppPrivateKey()) missing.push("GITHUB_APP_PRIVATE_KEY");
  if (!githubSessionPassword()) missing.push("GITHUB_SESSION_PASSWORD");
  return missing;
}
