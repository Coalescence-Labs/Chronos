import { readGitHubAppSessionForUser, destroyGitHubAppSession } from "./session";
import { clearGitHubInstallMetadata } from "./workos-metadata";
import { activeGitHubUserToken } from "./token";
import { revokeGitHubUserGrant } from "./user-auth";

export type GitHubDisconnectResult = { ok: true; warning?: "provider-revocation" } | { ok: false; message: string };

/** Revoke the user's authority without uninstalling an App shared with other people. */
export async function disconnectGitHubForUser(userId: string | null | undefined): Promise<GitHubDisconnectResult> {
  let cleared = false;
  let revoked = false;
  try {
    if (!userId) return { ok: false, message: "Sign in again to disconnect GitHub." };
    const session = await readGitHubAppSessionForUser(userId);
    try { await clearGitHubInstallMetadata(userId); cleared = true; }
    catch { /* Try provider revocation even if the durable clear is unavailable. */ }
    if (session?.userAccessToken) {
      try { await revokeGitHubUserGrant(await activeGitHubUserToken(session)); revoked = true; }
      catch { revoked = false; }
    }
    return cleared
      ? { ok: true, ...(!revoked ? { warning: "provider-revocation" as const } : {}) }
      : { ok: false, message: "Couldn't confirm that GitHub disconnected on all devices. Please retry." };
  } finally { await destroyGitHubAppSession(); }
}
