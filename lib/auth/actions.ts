"use server";

import { signOut } from "@workos-inc/authkit-nextjs";
import { absoluteAuthReturnUrl } from "@/lib/auth/return-to";

/**
 * POST-only sign-out (server action). Never expose a GET sign-out route —
 * Link prefetch / CSRF via img src could clear the session.
 *
 * returnTo must be an absolute URL matching the WorkOS dashboard Sign-out
 * redirect URI (e.g. http://localhost:3005/). Relative "/" lands on AuthKit's
 * error page after the cookie is already cleared.
 */
export async function signOutAction(): Promise<void> {
  await signOut({ returnTo: absoluteAuthReturnUrl("/") });
}
