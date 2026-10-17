"use server";

import { redirect } from "next/navigation";
import { isGitHubAppConfigured } from "./config";
import { deleteInstallation } from "./install";
import { peekGitHubInstallBinding } from "./resolve-session";
import { destroyGitHubAppSession } from "./session";
import { clearGitHubInstallMetadata } from "./workos-metadata";
import { githubInstallBindings } from "./bindings";

/**
 * POST-only disconnect — clears every binding and credential. Shared organization
 * installations stay on GitHub; personal installations are best-effort removed.
 */
export async function disconnectGitHubAction(): Promise<void> {
  const { withAuth } = await import("@workos-inc/authkit-nextjs");
  const { user } = await withAuth({ ensureSignedIn: false }).catch(() => ({
    user: null,
  }));
  const binding = await peekGitHubInstallBinding(user?.id);
  if (isGitHubAppConfigured() && binding) {
    for (const install of githubInstallBindings(binding)) {
      if (install.accountType === "Organization") continue;
      try {
        await deleteInstallation(install.installationId);
      } catch {
        // Session clear still proceeds; UI discloses manual uninstall.
      }
    }
  }
  try {
    if (user?.id) await clearGitHubInstallMetadata(user.id);
  } finally {
    await destroyGitHubAppSession();
  }
  redirect("/account?github=disconnected");
}
