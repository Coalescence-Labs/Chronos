import { readGitHubAppSessionForUser, destroyGitHubAppSession } from "./session";
import { deleteStoredGitHubCredentials, readStoredGitHubCredentials } from "./credential-store";
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
    const cookie = await readGitHubAppSessionForUser(userId);
    // After sign-out the durable Vault copy may be the only credential left;
    // revoke with it so the grant really ends.
    const stored = cookie?.userAccessToken ? undefined : await readStoredGitHubCredentials(userId);
    const session = stored
      ? { installationId: 0, accountLogin: "", accountType: "User" as const, connectedAt: new Date(0).toISOString(),
          permissions: "", ...cookie, workosUserId: userId, ...stored }
      : cookie;
    try { await clearGitHubInstallMetadata(userId); cleared = true; }
    catch { /* Try provider revocation even if the durable clear is unavailable. */ }
    if (session?.userAccessToken) {
      try { await revokeGitHubUserGrant(await activeGitHubUserToken(session)); revoked = true; }
      catch { revoked = false; }
    }
    // Delete last: a refresh during revocation above would re-store tokens.
    // Best-effort — the version rotation already makes any stored copy
    // unusable, so a Vault hiccup must not report Disconnect as failed.
    await deleteStoredGitHubCredentials(userId);
    return cleared
      ? { ok: true, ...(!revoked ? { warning: "provider-revocation" as const } : {}) }
      : { ok: false, message: "Couldn't confirm that GitHub disconnected on all devices. Please retry." };
  } finally { await destroyGitHubAppSession(); }
}
