import { NextResponse } from "next/server";
import { withAuth } from "@workos-inc/authkit-nextjs";
import {
  assertNoSecretsInPublicGitHubConnection,
  isGitHubOAuthConfigured,
  readGitHubOAuthSessionForUser,
  toPublicGitHubConnection,
} from "@/lib/github-oauth";

/**
 * GET /api/github/status — public connection view (no token).
 */
export async function GET(): Promise<Response> {
  if (!isGitHubOAuthConfigured()) {
    const body = toPublicGitHubConnection(undefined);
    assertNoSecretsInPublicGitHubConnection(body);
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  }

  const { user } = await withAuth({ ensureSignedIn: false }).catch(() => ({
    user: null,
  }));
  const session = await readGitHubOAuthSessionForUser(user?.id);
  const body = toPublicGitHubConnection(session);
  assertNoSecretsInPublicGitHubConnection(body);
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
