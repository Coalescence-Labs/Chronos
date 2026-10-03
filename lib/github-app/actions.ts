"use server";

import { redirect } from "next/navigation";
import { isGitHubAppConfigured } from "./config";
import { deleteInstallation } from "./install";
import { peekGitHubInstallBinding } from "./resolve-session";
import { destroyGitHubAppSession } from "./session";
import { clearGitHubInstallMetadata } from "./workos-metadata";

/**
 * POST-only disconnect — clears sealed gh-session and best-effort uninstalls
 * the GitHub App installation. User may still remove the App from GitHub
 * Settings → Applications if uninstall fails.
 */
export async function disconnectGitHubAction(): Promise<void> {
  const { withAuth } = await import("@workos-inc/authkit-nextjs");
  const { user } = await withAuth({ ensureSignedIn: false }).catch(() => ({
    user: null,
  }));
  const binding = await peekGitHubInstallBinding(user?.id);
  if (isGitHubAppConfigured() && binding) {
    try {
      await deleteInstallation(binding.installationId);
    } catch {
      // Session clear still proceeds; UI discloses manual uninstall.
    }
  }
  if (user?.id) {
    await clearGitHubInstallMetadata(user.id);
  }
  await destroyGitHubAppSession();
  redirect("/account?github=disconnected");
}
