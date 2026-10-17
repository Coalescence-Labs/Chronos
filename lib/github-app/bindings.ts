import type { GitHubAppSessionData, GitHubInstallBinding } from "./types";

export function githubInstallBindings(
  session: GitHubInstallBinding & { additionalInstallations?: GitHubInstallBinding[] },
): GitHubInstallBinding[] {
  const { installationId, accountLogin, accountType, connectedAt, permissions } = session;
  return [
    { installationId, accountLogin, accountType, connectedAt, permissions },
    ...(session.additionalInstallations ?? []),
  ];
}

export function mergeGitHubInstallation(
  existing: GitHubAppSessionData | undefined,
  incoming: GitHubAppSessionData,
): GitHubAppSessionData {
  const bindings = existing?.workosUserId === incoming.workosUserId
    ? githubInstallBindings(existing)
    : [];
  const previous = bindings.find((binding) => binding.installationId === incoming.installationId);
  const next = {
    ...githubInstallBindings(incoming)[0]!,
    connectedAt: previous?.connectedAt ?? incoming.connectedAt,
  };
  const remaining = bindings.filter((binding) =>
    binding.installationId !== next.installationId &&
    binding.accountLogin.toLowerCase() !== next.accountLogin.toLowerCase(),
  );
  return {
    ...incoming,
    ...next,
    ...(remaining.length ? { additionalInstallations: remaining } : {}),
  };
}
