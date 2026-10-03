import { isAuthConfigured } from "@/lib/auth/config";
import type { GitHubAppSessionData } from "./types";

/** WorkOS metadata keys (≤40 chars). Values are strings ≤600 chars; no tokens. */
export const GITHUB_INSTALL_METADATA_KEYS = {
  installationId: "chronosGhInstallationId",
  accountLogin: "chronosGhAccountLogin",
  accountType: "chronosGhAccountType",
  connectedAt: "chronosGhConnectedAt",
  permissions: "chronosGhPermissions",
} as const;

export type GitHubInstallMetadataBinding = Pick<
  GitHubAppSessionData,
  "installationId" | "accountLogin" | "accountType" | "connectedAt" | "permissions"
>;

export function githubInstallMetadataFromSession(
  data: GitHubAppSessionData,
): Record<string, string> {
  return {
    [GITHUB_INSTALL_METADATA_KEYS.installationId]: String(data.installationId),
    [GITHUB_INSTALL_METADATA_KEYS.accountLogin]: data.accountLogin,
    [GITHUB_INSTALL_METADATA_KEYS.accountType]: data.accountType,
    [GITHUB_INSTALL_METADATA_KEYS.connectedAt]: data.connectedAt,
    [GITHUB_INSTALL_METADATA_KEYS.permissions]: data.permissions,
  };
}

export function parseGitHubInstallMetadata(
  metadata: Record<string, string> | undefined,
): GitHubInstallMetadataBinding | undefined {
  if (!metadata) return undefined;
  const installationRaw = metadata[GITHUB_INSTALL_METADATA_KEYS.installationId];
  const installationId = installationRaw
    ? Number.parseInt(installationRaw, 10)
    : NaN;
  const accountLogin = metadata[GITHUB_INSTALL_METADATA_KEYS.accountLogin]?.trim();
  const accountTypeRaw = metadata[GITHUB_INSTALL_METADATA_KEYS.accountType];
  const connectedAt = metadata[GITHUB_INSTALL_METADATA_KEYS.connectedAt]?.trim();
  const permissions =
    metadata[GITHUB_INSTALL_METADATA_KEYS.permissions]?.trim() ??
    "contents:read,metadata:read";

  if (
    !Number.isFinite(installationId) ||
    installationId <= 0 ||
    !accountLogin ||
    (accountTypeRaw !== "User" && accountTypeRaw !== "Organization") ||
    !connectedAt
  ) {
    return undefined;
  }

  return {
    installationId,
    accountLogin,
    accountType: accountTypeRaw,
    connectedAt,
    permissions,
  };
}

function clearGitHubInstallMetadataPatch(): Record<string, null> {
  return {
    [GITHUB_INSTALL_METADATA_KEYS.installationId]: null,
    [GITHUB_INSTALL_METADATA_KEYS.accountLogin]: null,
    [GITHUB_INSTALL_METADATA_KEYS.accountType]: null,
    [GITHUB_INSTALL_METADATA_KEYS.connectedAt]: null,
    [GITHUB_INSTALL_METADATA_KEYS.permissions]: null,
  };
}

async function workosClient() {
  const { getWorkOS } = await import("@workos-inc/authkit-nextjs");
  return getWorkOS();
}

function metadataWritePersisted(
  metadata: Record<string, string> | undefined,
  data: GitHubAppSessionData,
): boolean {
  const parsed = parseGitHubInstallMetadata(metadata);
  return (
    parsed !== undefined &&
    parsed.installationId === data.installationId &&
    parsed.accountLogin === data.accountLogin
  );
}

export async function writeGitHubInstallMetadata(
  workosUserId: string,
  data: GitHubAppSessionData,
): Promise<void> {
  if (!isAuthConfigured()) {
    throw new Error("WorkOS is not configured — cannot persist GitHub install metadata");
  }
  const workos = await workosClient();
  const updated = await workos.userManagement.updateUser({
    userId: workosUserId,
    metadata: githubInstallMetadataFromSession(data),
  });
  if (!metadataWritePersisted(updated.metadata, data)) {
    throw new Error("GitHub install metadata did not persist on WorkOS user");
  }
}

export async function clearGitHubInstallMetadata(workosUserId: string): Promise<void> {
  if (!isAuthConfigured()) return;
  const workos = await workosClient();
  const updated = await workos.userManagement.updateUser({
    userId: workosUserId,
    metadata: clearGitHubInstallMetadataPatch(),
  });
  if (parseGitHubInstallMetadata(updated.metadata)) {
    throw new Error("GitHub install metadata was not cleared on WorkOS user");
  }
}

export async function readGitHubInstallMetadata(
  workosUserId: string,
): Promise<GitHubInstallMetadataBinding | undefined> {
  if (!isAuthConfigured()) return undefined;
  try {
    const workos = await workosClient();
    const user = await workos.userManagement.getUser(workosUserId);
    return parseGitHubInstallMetadata(user.metadata);
  } catch {
    return undefined;
  }
}
