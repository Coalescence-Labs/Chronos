"use server";

import { redirect } from "next/navigation";
import { isGitHubAppConfigured } from "./config";
import { deleteInstallation } from "./install";
import { destroyGitHubAppSession, getGitHubAppSession } from "./session";

/**
 * POST-only disconnect — clears sealed gh-session and best-effort uninstalls
 * the GitHub App installation. User may still remove the App from GitHub
 * Settings → Applications if uninstall fails.
 */
export async function disconnectGitHubAction(): Promise<void> {
  if (isGitHubAppConfigured()) {
    try {
      const session = await getGitHubAppSession();
      if (typeof session.installationId === "number") {
        await deleteInstallation(session.installationId);
      }
    } catch {
      // Session clear still proceeds; UI discloses manual uninstall.
    }
  }
  await destroyGitHubAppSession();
  redirect("/account?github=disconnected");
}
