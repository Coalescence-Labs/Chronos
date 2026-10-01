/**
 * Auth configuration + cookie posture for WorkOS AuthKit (COA-200).
 *
 * Aligns with BFF decision #7: sealed session in an encrypted httpOnly,
 * Secure, SameSite cookie — tokens never exposed to browser JS.
 *
 * Required env (never commit secrets):
 * - WORKOS_CLIENT_ID
 * - WORKOS_API_KEY
 * - WORKOS_COOKIE_PASSWORD (≥32 chars)
 * - NEXT_PUBLIC_WORKOS_REDIRECT_URI (e.g. http://localhost:3005/callback)
 *
 * Recommended:
 * - WORKOS_COOKIE_MAX_AGE — default AuthKit is 400 days; Chronos prefers
 *   shorter (7d = 604800). Set in .env.example.
 * - WORKOS_COOKIE_SAMESITE=lax (default; do not use none)
 */

/** 7 days — minimum practical signed-in window; override via env. */
export const AUTH_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export function isAuthConfigured(): boolean {
  return Boolean(
    process.env.WORKOS_CLIENT_ID &&
      process.env.WORKOS_API_KEY &&
      process.env.WORKOS_COOKIE_PASSWORD &&
      process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI,
  );
}

/** Cookie attributes we require of the AuthKit session cookie. */
export const AUTH_COOKIE_POSTURE = {
  httpOnly: true,
  secureInProduction: true,
  sameSite: "lax" as const,
  /** Prefer short TTL; AuthKit reads WORKOS_COOKIE_MAX_AGE. */
  recommendedMaxAgeSeconds: AUTH_SESSION_MAX_AGE_SECONDS,
  /** Default AuthKit cookie name when WORKOS_COOKIE_NAME is unset. */
  defaultName: "wos-session",
} as const;
