"use server";

import { chronosSignOut } from "@/lib/auth/sign-out";

/**
 * POST-only sign-out (server action). Never expose a GET sign-out route —
 * Link prefetch / CSRF via img src could clear the session.
 *
 * Uses Chronos local sign-out (clear sealed cookie + redirect home). Does not
 * call AuthKit `signOut()` / WorkOS hosted logout — that path requires an
 * exact dashboard Logout redirect URI and otherwise lands on error.workos.com.
 */
export async function signOutAction(): Promise<void> {
  await chronosSignOut("/");
}
