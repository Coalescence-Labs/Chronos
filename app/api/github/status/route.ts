import { NextResponse } from "next/server";
import { withAuth } from "@workos-inc/authkit-nextjs";
import {
  assertNoSecretsInPublicGitHubConnection, isGitHubAppConfigured,
  resolveGitHubAppSessionForUser, toPublicGitHubConnection,
} from "@/lib/github-app";
import { activeGitHubUserToken } from "@/lib/github-app/token";
import { assertGitHubUserInstallation } from "@/lib/github-app/user-auth";
import { githubInstallBindings } from "@/lib/github-app/bindings";
import type { GitHubAppSessionData } from "@/lib/github-app/types";
import { IngestError } from "@/lib/ingest/errors";
import { enforceRequestLimitAsync } from "@/lib/security/request";

/** Health-checked, allowlisted status; never seals a credential-free cookie over a live session. */
export async function GET(request: Request): Promise<Response> {
  let session: GitHubAppSessionData | undefined;
  try {
    if (isGitHubAppConfigured()) {
      const { user } = await withAuth({ ensureSignedIn: false });
      await enforceRequestLimitAsync(request, user?.id, "connection");
      session = await resolveGitHubAppSessionForUser(user?.id);
      if (session?.userAccessToken) {
        const token = await activeGitHubUserToken(session);
        await assertGitHubUserInstallation(token, session.installationId,
          githubInstallBindings(session).slice(1).map((binding) => binding.installationId));
        const body = { ...toPublicGitHubConnection(session), connected: true, state: "connected" as const };
        assertNoSecretsInPublicGitHubConnection(body);
        return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
      }
    }
    const body = toPublicGitHubConnection(session);
    assertNoSecretsInPublicGitHubConnection(body);
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const reconnect = error instanceof IngestError && ["reconnect-required", "access-denied"].includes(error.code);
    const incomplete = error instanceof IngestError && error.code === "disconnect-incomplete";
    const body = { ...toPublicGitHubConnection(session), connected: false,
      state: incomplete ? "disconnect-incomplete" as const : reconnect ? "reconnect-required" as const : "unavailable" as const };
    assertNoSecretsInPublicGitHubConnection(body);
    return NextResponse.json(body, {
      status: reconnect ? 200 : error instanceof IngestError && error.code === "rate-limited" ? 429 : 503,
      headers: { "Cache-Control": "no-store", ...(error instanceof IngestError && error.retryAfterSeconds
        ? { "Retry-After": String(error.retryAfterSeconds) } : {}) },
    });
  }
}
