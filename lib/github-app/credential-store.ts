import "server-only";
import { isAuthConfigured } from "@/lib/auth/config";
import { githubMetadataClient } from "./metadata-client";
import type { GitHubAppSessionData } from "./types";

/**
 * Durable GitHub user credentials in WorkOS Vault (COA-747).
 *
 * The sealed `gh-session` cookie used to be the only copy of the user's
 * GitHub access/refresh tokens, so the connection was lost whenever the cookie
 * was: 7-day expiry, sign-out, a new device, or a refresh whose rotated
 * tokens never reached the browser (GitHub consumes the old refresh token, the
 * aborted response drops the new one). Vault keeps one encrypted object per
 * WorkOS user; the cookie is now a fast cache in front of it.
 *
 * - Encrypted by WorkOS with a key derived from `context` (one per user).
 * - Holds only what's needed to call GitHub for this user: tokens, expiry and
 *   the authorization version they were issued under. No repo data.
 * - Replaced on every rotation; deleted on Disconnect. Sign-out keeps it.
 * - Every failure degrades to the cookie-only behaviour — Vault being
 *   unavailable must never break reading public repos or signing in.
 * - Values are never logged; errors are swallowed without their message.
 */

export type GitHubUserCredentialFields = Pick<
  GitHubAppSessionData,
  "userAccessToken" | "userRefreshToken" | "userTokenExpiresAt" | "authorizationVersion"
>;

export interface StoredGitHubCredentials extends GitHubUserCredentialFields {
  userAccessToken: string;
}

interface VaultObjectLike {
  id: string;
  value?: string;
}

const NAME_PREFIX = "chronos-gh-user-";

function objectName(workosUserId: string): string {
  return `${NAME_PREFIX}${workosUserId}`;
}

function statusOf(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : undefined;
}

function parse(value: string | undefined): StoredGitHubCredentials | undefined {
  if (!value) return undefined;
  try {
    const raw = JSON.parse(value) as Record<string, unknown>;
    if (typeof raw.userAccessToken !== "string" || !raw.userAccessToken) return undefined;
    return {
      userAccessToken: raw.userAccessToken,
      ...(typeof raw.userRefreshToken === "string" && raw.userRefreshToken
        ? { userRefreshToken: raw.userRefreshToken } : {}),
      ...(typeof raw.userTokenExpiresAt === "number" && Number.isFinite(raw.userTokenExpiresAt)
        ? { userTokenExpiresAt: raw.userTokenExpiresAt } : {}),
      ...(typeof raw.authorizationVersion === "string" && raw.authorizationVersion
        ? { authorizationVersion: raw.authorizationVersion } : {}),
    };
  } catch {
    return undefined;
  }
}

function serialize(credentials: StoredGitHubCredentials): string {
  return JSON.stringify({
    userAccessToken: credentials.userAccessToken,
    userRefreshToken: credentials.userRefreshToken,
    userTokenExpiresAt: credentials.userTokenExpiresAt,
    authorizationVersion: credentials.authorizationVersion,
  });
}

async function readObject(workosUserId: string): Promise<VaultObjectLike | undefined> {
  try {
    return await githubMetadataClient().vault.readObjectByName(objectName(workosUserId));
  } catch (error) {
    if (statusOf(error) === 404) return undefined;
    throw error;
  }
}

/** Stored credentials for this user, or undefined when absent or Vault is unreachable. */
export async function readStoredGitHubCredentials(
  workosUserId: string,
): Promise<StoredGitHubCredentials | undefined> {
  if (!isAuthConfigured()) return undefined;
  try {
    return parse((await readObject(workosUserId))?.value);
  } catch {
    return undefined;
  }
}

/**
 * Upsert this user's credentials. Returns false (never throws) when Vault is
 * unavailable, so callers keep the cookie path working.
 */
export async function storeGitHubCredentials(
  workosUserId: string,
  credentials: GitHubUserCredentialFields,
): Promise<boolean> {
  if (!isAuthConfigured() || !credentials.userAccessToken) return false;
  const value = serialize(credentials as StoredGitHubCredentials);
  const vault = githubMetadataClient().vault;
  try {
    const existing = await readObject(workosUserId);
    if (existing) {
      await vault.updateObject({ id: existing.id, value });
      return true;
    }
    try {
      await vault.createObject({
        name: objectName(workosUserId),
        value,
        context: { chronosUser: workosUserId },
      });
    } catch (error) {
      // Lost a create race with another request: overwrite the winner — both
      // hold freshly issued, valid credentials for the same user.
      if (statusOf(error) !== 409) throw error;
      const winner = await readObject(workosUserId);
      if (!winner) return false;
      await vault.updateObject({ id: winner.id, value });
    }
    return true;
  } catch {
    return false;
  }
}

/** Remove this user's credentials (Disconnect). True when gone or never stored. */
export async function deleteStoredGitHubCredentials(workosUserId: string): Promise<boolean> {
  if (!isAuthConfigured()) return true;
  try {
    const existing = await readObject(workosUserId);
    if (existing) await githubMetadataClient().vault.deleteObject({ id: existing.id });
    return true;
  } catch (error) {
    return statusOf(error) === 404;
  }
}
