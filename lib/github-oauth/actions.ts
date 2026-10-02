"use server";

import { destroyGitHubOAuthSession } from "@/lib/github-oauth/session";
import { redirect } from "next/navigation";

/** POST-only disconnect via server action — clears sealed gh-session. */
export async function disconnectGitHubAction(): Promise<void> {
  await destroyGitHubOAuthSession();
  redirect("/account?github=disconnected");
}
