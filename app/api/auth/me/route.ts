import { withAuth } from "@workos-inc/authkit-nextjs";
import {
  assertNoSecretsInPublicSession,
  isAuthConfigured,
  toPublicSession,
} from "@/lib/auth";

/**
 * GET /api/auth/me — public session view for the signed-in user.
 * Returns { authenticated: false } when anonymous. Never includes tokens.
 */
export async function GET(): Promise<Response> {
  if (!isAuthConfigured()) {
    return Response.json(
      { authenticated: false, user: null, configured: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const { user } = await withAuth({ ensureSignedIn: false });
  const session = toPublicSession(user);
  assertNoSecretsInPublicSession(session);
  return Response.json(
    { ...session, configured: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
