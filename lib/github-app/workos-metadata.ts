import { isAuthConfigured } from "@/lib/auth/config";
import type { GitHubAppSessionData } from "./types";
import { githubInstallBindings } from "./bindings";
import { githubMetadataClient } from "./metadata-client";
import { randomUUID } from "node:crypto";
import { IngestError } from "@/lib/ingest/errors";

const INSTALL_PREFIX = "chronosGhInstall_";
const VERSION_KEY = "chronosGhVersion";
export const INITIAL_GITHUB_AUTHORIZATION_VERSION = "initial";

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
> & { additionalInstallations?: GitHubInstallMetadataBinding[]; authorizationVersion?: string };

export function githubInstallMetadataFromSession(
  data: GitHubAppSessionData,
): Record<string, string> {
  return Object.fromEntries(githubInstallBindings(data).map((binding) => [
    `${INSTALL_PREFIX}${binding.installationId}`,
    JSON.stringify([
      binding.accountLogin, binding.accountType, binding.connectedAt, binding.permissions,
      data.authorizationVersion ?? INITIAL_GITHUB_AUTHORIZATION_VERSION,
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
        !Array.isArray(fields) || (fields.length !== 4 && fields.length !== 5)) continue;
      const [accountLogin, accountType, connectedAt, permissions, version = INITIAL_GITHUB_AUTHORIZATION_VERSION] = fields;
      if (version !== authorizationVersion(metadata)) continue;
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
    return { ...first!, authorizationVersion: authorizationVersion(metadata), ...(additionalInstallations.length ? { additionalInstallations } : {}) };
  }
  if (authorizationVersion(metadata) !== INITIAL_GITHUB_AUTHORIZATION_VERSION) return undefined;
  const installationRaw = metadata[GITHUB_INSTALL_METADATA_KEYS.installationId];
  const installationId = installationRaw
    ? Number(installationRaw)
    : NaN;
  const accountLogin = metadata[GITHUB_INSTALL_METADATA_KEYS.accountLogin]?.trim();
  const accountTypeRaw = metadata[GITHUB_INSTALL_METADATA_KEYS.accountType];
  const connectedAt = metadata[GITHUB_INSTALL_METADATA_KEYS.connectedAt]?.trim();
  const permissions =
    metadata[GITHUB_INSTALL_METADATA_KEYS.permissions]?.trim() ??
    "contents:read,metadata:read";

  if (
    !Number.isSafeInteger(installationId) ||
    installationId <= 0 ||
    !accountLogin ||
    (accountTypeRaw !== "User" && accountTypeRaw !== "Organization") ||
    !connectedAt || !Number.isFinite(Date.parse(connectedAt))
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

function authorizationVersion(metadata?: Record<string, string>): string {
  return metadata?.[VERSION_KEY] ?? INITIAL_GITHUB_AUTHORIZATION_VERSION;
}

export async function readGitHubAuthorizationVersion(workosUserId: string): Promise<string> {
  const user = await githubMetadataClient().userManagement.getUser(workosUserId);
  const version = authorizationVersion(user.metadata);
  if (version.startsWith("revoking:")) throw new IngestError("disconnect-incomplete", "GitHub disconnect is incomplete. Retry disconnect from your account.");
  return version;
}

function metadataWritePersisted(
  metadata: Record<string, string> | undefined,
  data: GitHubAppSessionData,
): boolean {
  const parsed = parseGitHubInstallMetadata(metadata);
  if (!parsed) return false;
  const actual = githubInstallBindings(parsed);
  return githubInstallBindings(data).every((binding) => actual.some((saved) =>
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
  const workos = githubMetadataClient();
  const current = await workos.userManagement.getUser(workosUserId);
  const expectedVersion = data.authorizationVersion ?? INITIAL_GITHUB_AUTHORIZATION_VERSION;
  if (authorizationVersion(current.metadata) !== expectedVersion) {
    throw new IngestError("reconnect-required", "Your GitHub connections changed. Please reconnect GitHub.");
  }
  const legacyPatch = Object.fromEntries(Object.values(GITHUB_INSTALL_METADATA_KEYS)
    .filter((key) => key in (current.metadata ?? {})).map((key) => [key, null]));
  const legacy = expectedVersion === INITIAL_GITHUB_AUTHORIZATION_VERSION
    ? parseGitHubInstallMetadata(Object.fromEntries(Object.keys(legacyPatch).map((key) => [key, current.metadata![key]!])))
    : undefined;
  const migrated = legacy ? githubInstallMetadataFromSession({ ...legacy, workosUserId }) : {};
  const incoming = githubInstallBindings(data);
  const saved = parseGitHubInstallMetadata(current.metadata);
  const savedBindings = [...(saved ? githubInstallBindings(saved) : []), ...(legacy ? githubInstallBindings(legacy) : [])];
  const replaced = savedBindings.filter((binding) => incoming.some((next) =>
    next.installationId !== binding.installationId && next.accountType === binding.accountType &&
    next.accountLogin.toLowerCase() === binding.accountLogin.toLowerCase(),
  ));
  const replacedKeys = new Set(replaced.map((binding) => `${INSTALL_PREFIX}${binding.installationId}`));
  const replacedPatch = Object.fromEntries([...replacedKeys].filter((key) => key in (current.metadata ?? {})).map((key) => [key, null]));
  const patch = { ...legacyPatch,
    ...Object.fromEntries(Object.entries(migrated).filter(([key]) => !(key in (current.metadata ?? {})) && !replacedKeys.has(key))),
    ...replacedPatch,
    ...githubInstallMetadataFromSession(data) };
  const retainedKeys = Object.keys(current.metadata ?? {}).filter((key) => !(key in patch));
  const reserve = current.metadata?.[VERSION_KEY] ? 0 : 1;
  if (retainedKeys.length + Object.values(patch).filter((value) => value !== null).length + reserve > 10) {
    throw new IngestError("too-large", "This account has reached its GitHub connection limit. Existing connections are unchanged.");
  }
  const updated = await workos.userManagement.updateUser({
    userId: workosUserId,
    metadata: patch,
  });
  if (authorizationVersion(updated.metadata) !== expectedVersion || !metadataWritePersisted(updated.metadata, data) ||
    Object.keys(replacedPatch).some((key) => key in (updated.metadata ?? {}))) {
    throw new Error("GitHub install metadata did not persist on WorkOS user");
  }
}

export async function clearGitHubInstallMetadata(workosUserId: string): Promise<void> {
  if (!isAuthConfigured()) throw new Error("WorkOS is not configured — cannot revoke GitHub bindings");
  const workos = githubMetadataClient();
  const current = await workos.userManagement.getUser(workosUserId);
  const clearPatch = clearGitHubInstallMetadataPatch(current.metadata);
  const version = randomUUID();
  if (Object.keys(clearPatch).length >= 10) {
    const [first, ...remaining] = Object.keys(clearPatch);
    await workos.userManagement.updateUser({ userId: workosUserId, metadata: { [first!]: null, [VERSION_KEY]: `revoking:${version}` } });
    await workos.userManagement.updateUser({ userId: workosUserId, metadata: Object.fromEntries(remaining.map((key) => [key, null])) });
  }
  const updated = await workos.userManagement.updateUser({
    userId: workosUserId,
    metadata: { ...(Object.keys(clearPatch).length < 10 ? clearPatch : {}), [VERSION_KEY]: version },
  });
  if (parseGitHubInstallMetadata(updated.metadata)) {
    throw new Error("GitHub install metadata was not cleared on WorkOS user");
  }
}

export async function readGitHubInstallMetadata(
  workosUserId: string,
): Promise<GitHubInstallMetadataBinding | undefined> {
  if (!isAuthConfigured()) return undefined;
  const user = await githubMetadataClient().userManagement.getUser(workosUserId);
  if (authorizationVersion(user.metadata).startsWith("revoking:")) {
    throw new IngestError("disconnect-incomplete", "GitHub disconnect is incomplete. Retry disconnect from your account.");
  }
  return parseGitHubInstallMetadata(user.metadata);
}
