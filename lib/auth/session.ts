import type { AuthUserLike, PublicSession, PublicUser } from "./types";

/**
 * Map a WorkOS user to the public /me payload.
 * Explicit allowlist — never pass through accessToken / refreshToken.
 */
export function toPublicUser(user: AuthUserLike): PublicUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    emailVerified: user.emailVerified,
    profilePictureUrl: user.profilePictureUrl,
  };
}

export function toPublicSession(user: AuthUserLike | null | undefined): PublicSession {
  if (!user) {
    return { authenticated: false, user: null };
  }
  return { authenticated: true, user: toPublicUser(user) };
}

/** True if a Set-Cookie string matches Chronos BFF session posture. */
export function sessionCookieLooksHardened(setCookie: string): boolean {
  const lower = setCookie.toLowerCase();
  return lower.includes("httponly") && lower.includes("samesite=lax");
}

/** Reject payloads that would leak secrets into /me or client bundles. */
export function assertNoSecretsInPublicSession(session: PublicSession): void {
  const blob = JSON.stringify(session);
  if (
    /accessToken|refreshToken|WORKOS_API_KEY|cookie.?password/i.test(blob) ||
    /"password"\s*:/i.test(blob)
  ) {
    throw new Error("Public session payload must not include secrets");
  }
}
