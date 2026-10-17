import { isAuthConfigured } from "@/lib/auth/config";
import type { GitHubAppSessionData } from "./types";
import { githubInstallBindings } from "./bindings";

const INSTALL_PREFIX = "chronosGhInstall_";

/** Legacy keys, retained for migration. New bindings use one key per install. */
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
> & { additionalInstallations?: GitHubInstallMetadataBinding[] };

export function githubInstallMetadataFromSession(
  data: GitHubAppSessionData,
): Record<string, string> {
  return Object.fromEntries(githubInstallBindings(data).map((binding) => [
    `${INSTALL_PREFIX}${binding.installationId}`,
    JSON.stringify([
      binding.accountLogin, binding.accountType, binding.connectedAt, binding.permissions,
    ]),
  ]));
}

export function parseGitHubInstallMetadata(
  metadata: Record<string, string> | undefined,
): GitHubInstallMetadataBinding | undefined {
  if (!metadata) return undefined;
  const bindings: GitHubInstallMetadataBinding[] = [];
  for (const [key, value] of Object.entries(metadata)) {
    if (!key.startsWith(INSTALL_PREFIX)) continue;
    const installationId = Number(key.slice(INSTALL_PREFIX.length));
    try {
      const fields: unknown = JSON.parse(value);
      if (!Number.isSafeInteger(installationId) || installationId <= 0 ||
        !Array.isArray(fields) || fields.length !== 4) continue;
      const [accountLogin, accountType, connectedAt, permissions] = fields;
      if (typeof accountLogin !== "string" || !accountLogin ||
        (accountType !== "User" && accountType !== "Organization") ||
        typeof connectedAt !== "string" || !Number.isFinite(Date.parse(connectedAt)) ||
        typeof permissions !== "string") continue;
      bindings.push({ installationId, accountLogin, accountType, connectedAt, permissions });
    } catch {
      // Ignore malformed bindings without discarding other connections.
    }
  }
  if (bindings.length) {
    const [first, ...additionalInstallations] = bindings;
    return { ...first!, ...(additionalInstallations.length ? { additionalInstallations } : {}) };
  }
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

function clearGitHubInstallMetadataPatch(metadata?: Record<string, string>): Record<string, null> {
  const patch = {
    ...Object.fromEntries(Object.keys(metadata ?? {})
      .filter((key) => key.startsWith(INSTALL_PREFIX)).map((key) => [key, null])),
    [GITHUB_INSTALL_METADATA_KEYS.installationId]: null,
    [GITHUB_INSTALL_METADATA_KEYS.accountLogin]: null,
    [GITHUB_INSTALL_METADATA_KEYS.accountType]: null,
    [GITHUB_INSTALL_METADATA_KEYS.connectedAt]: null,
    [GITHUB_INSTALL_METADATA_KEYS.permissions]: null,
  };
  return Object.fromEntries(Object.entries(patch).filter(([key]) => metadata && key in metadata));
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
  if (!parsed) return false;
  const actual = githubInstallBindings(parsed);
  return actual.length === githubInstallBindings(data).length &&
    githubInstallBindings(data).every((binding) => actual.some((saved) =>
      saved.installationId === binding.installationId &&
      saved.accountLogin === binding.accountLogin && saved.accountType === binding.accountType &&
      saved.connectedAt === binding.connectedAt && saved.permissions === binding.permissions,
    ));
}

export async function writeGitHubInstallMetadata(
  workosUserId: string,
  data: GitHubAppSessionData,
): Promise<void> {
  if (!isAuthConfigured()) {
    throw new Error("WorkOS is not configured — cannot persist GitHub install metadata");
  }
  const workos = await workosClient();
  const current = await workos.userManagement.getUser(workosUserId);
  const patch = { ...clearGitHubInstallMetadataPatch(current.metadata),
    ...githubInstallMetadataFromSession(data) };
  const retainedKeys = Object.keys(current.metadata ?? {}).filter((key) => !(key in patch));
  if (retainedKeys.length + Object.values(patch).filter((value) => value !== null).length > 10) {
    throw new Error("GitHub connections exceed WorkOS metadata capacity");
  }
  const updated = await workos.userManagement.updateUser({
    userId: workosUserId,
    metadata: patch,
  });
  if (!metadataWritePersisted(updated.metadata, data)) {
    throw new Error("GitHub install metadata did not persist on WorkOS user");
  }
}

export async function clearGitHubInstallMetadata(workosUserId: string): Promise<void> {
  if (!isAuthConfigured()) return;
  const workos = await workosClient();
  const current = await workos.userManagement.getUser(workosUserId);
  const updated = await workos.userManagement.updateUser({
    userId: workosUserId,
    metadata: clearGitHubInstallMetadataPatch(current.metadata),
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
