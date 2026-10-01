/**
 * Public account shape returned by /api/auth/me.
 * Never includes access/refresh tokens or sealed-session secrets.
 */
export interface PublicUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  emailVerified: boolean;
  profilePictureUrl: string | null;
}

export interface PublicSession {
  authenticated: boolean;
  user: PublicUser | null;
}

/** WorkOS user fields we allow into PublicUser — keep this allowlist tight. */
export interface AuthUserLike {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  emailVerified: boolean;
  profilePictureUrl: string | null;
}
