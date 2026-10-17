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
import { githubInstallBindings, mergeGitHubInstallation } from "./bindings";

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
  const fromMetadata = await readGitHubInstallMetadata(workosUserId);
  if (!fromMetadata) return fromCookie;
  let result: GitHubAppSessionData = { ...fromMetadata, workosUserId };
  if (fromCookie) {
    for (const binding of githubInstallBindings(fromCookie)) {
      result = mergeGitHubInstallation(result, { ...binding, workosUserId });
    }
  }
  return result;
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

  const bindings = githubInstallBindings(fromMetadata);
  const valid: typeof bindings = [];
  const retained: typeof bindings = [];
  let changed = false;
  for (const binding of bindings) {
    try {
      const account = await fetchInstallationAccount(binding.installationId);
      const updated = { ...binding, ...account };
      valid.push(updated);
      retained.push(updated);
      changed ||= account.accountLogin !== binding.accountLogin || account.accountType !== binding.accountType;
    } catch (error) {
      if (error instanceof GitHubInstallationReadError && error.status === 404) {
        changed = true;
      } else {
        retained.push(binding);
      }
    }
  }
  if (changed) {
    if (!retained.length) await clearGitHubInstallMetadata(workosUserId);
    else await writeGitHubInstallMetadata(workosUserId, {
      ...retained[0]!, workosUserId,
      ...(retained.length > 1 ? { additionalInstallations: retained.slice(1) } : {}),
    });
  }
  if (!valid.length) return undefined;
  const session: GitHubAppSessionData = {
    ...retained[0]!,
    workosUserId,
    ...(retained.length > 1 ? { additionalInstallations: retained.slice(1) } : {}),
  };
  if (options?.persistSession) {
    await saveGitHubAppSession(session);
  }
  return session;
}
