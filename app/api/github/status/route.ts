import { NextResponse } from "next/server";
import { withAuth } from "@workos-inc/authkit-nextjs";
import {
  assertNoSecretsInPublicGitHubConnection,
  isGitHubAppConfigured,
  readGitHubAppSessionForUser,
  toPublicGitHubConnection,
} from "@/lib/github-app";

/**
 * GET /api/github/status — public connection view (no token / installation id).
 */
export async function GET(): Promise<Response> {
  if (!isGitHubAppConfigured()) {
    const body = toPublicGitHubConnection(undefined);
    assertNoSecretsInPublicGitHubConnection(body);
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  }

  const { user } = await withAuth({ ensureSignedIn: false }).catch(() => ({
    user: null,
  }));
  const session = await readGitHubAppSessionForUser(user?.id);
  const body = toPublicGitHubConnection(session);
  assertNoSecretsInPublicGitHubConnection(body);
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
