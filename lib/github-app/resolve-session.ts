import { isAuthConfigured } from "@/lib/auth/config";
import { isGitHubAppConfigured } from "./config";
import {
  fetchInstallationAccount,
  GitHubInstallationReadError,
} from "./install";
import {
  readGitHubAppSessionForUser,
  saveGitHubAppSession,
} from "./session";
import {
  clearGitHubInstallMetadata,
  readGitHubInstallMetadata,
  writeGitHubInstallMetadata,
} from "./workos-metadata";
import type { GitHubAppSessionData } from "./types";

export type ResolveGitHubSessionOptions = {
  /**
   * Seal rehydrated session into gh-session. Only Route Handlers / Server
   * Actions may set this — Next.js blocks Set-Cookie during RSC render.
   */
  persistSession?: boolean;
};

/**
 * Read install binding from gh-session or WorkOS user metadata — does not
 * rehydrate the cookie (used by Disconnect before clearing state).
 */
export async function peekGitHubInstallBinding(
  workosUserId: string | null | undefined,
): Promise<GitHubAppSessionData | undefined> {
  if (!workosUserId) return undefined;
  const fromCookie = await readGitHubAppSessionForUser(workosUserId);
  if (fromCookie) return fromCookie;
  const fromMetadata = await readGitHubInstallMetadata(workosUserId);
  if (!fromMetadata) return undefined;
  return { ...fromMetadata, workosUserId };
}

/**
 * Active GitHub App session for the signed-in user: gh-session first, else
 * rehydrate from WorkOS metadata when the install still exists on GitHub.
 */
export async function resolveGitHubAppSessionForUser(
  workosUserId: string | null | undefined,
  options?: ResolveGitHubSessionOptions,
): Promise<GitHubAppSessionData | undefined> {
  if (!workosUserId || !isGitHubAppConfigured()) return undefined;

  const fromCookie = await readGitHubAppSessionForUser(workosUserId);
  if (fromCookie) return fromCookie;

  if (!isAuthConfigured()) return undefined;

  const fromMetadata = await readGitHubInstallMetadata(workosUserId);
  if (!fromMetadata) return undefined;

  try {
    const account = await fetchInstallationAccount(fromMetadata.installationId);
    const session: GitHubAppSessionData = {
      installationId: account.installationId,
      accountLogin: account.accountLogin,
      accountType: account.accountType,
      workosUserId,
      connectedAt: fromMetadata.connectedAt,
      permissions: fromMetadata.permissions,
    };
    if (options?.persistSession) {
      await saveGitHubAppSession(session);
    }
    if (
      account.accountLogin !== fromMetadata.accountLogin ||
      account.accountType !== fromMetadata.accountType
    ) {
      try {
        await writeGitHubInstallMetadata(workosUserId, session);
      } catch {
        // Stale login/type in metadata is cosmetic; install id still valid.
      }
    }
    return session;
  } catch (error) {
    if (error instanceof GitHubInstallationReadError && error.status === 404) {
      await clearGitHubInstallMetadata(workosUserId);
    }
    return undefined;
  }
}
