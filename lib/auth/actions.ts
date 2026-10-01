"use server";

import { signOut } from "@workos-inc/authkit-nextjs";

/**
 * POST-only sign-out (server action). Never expose a GET sign-out route —
 * Link prefetch / CSRF via img src could clear the session.
 */
export async function signOutAction(): Promise<void> {
  await signOut({ returnTo: "/" });
}
