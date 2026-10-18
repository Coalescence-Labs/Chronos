"use server";

import { disconnectGitHubForUser, type GitHubDisconnectResult } from "./disconnect";

export async function disconnectGitHubAction(): Promise<GitHubDisconnectResult> {
  const { withAuth } = await import("@workos-inc/authkit-nextjs");
  const { user } = await withAuth({ ensureSignedIn: false }).catch(() => ({ user: null }));
  return disconnectGitHubForUser(user?.id);
}
