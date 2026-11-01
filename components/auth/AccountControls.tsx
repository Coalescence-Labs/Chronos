"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { signOutAction } from "@/lib/auth/actions";
import { AccountControlsSkeleton } from "./AccountControlsSkeleton";
import { ProfileMenu } from "./ProfileMenu";
import { SignInLink } from "./SignInLink";

/**
 * Client shell affordance — useAuth() so statically prerendered pages still
 * reflect the runtime session. Sign-in is hidden unless the public redirect
 * URI is configured (no WORKOS_API_KEY on the client).
 *
 * Loading: stable skeleton matching ProfileMenu size (never flash "Sign in").
 * Signed-out: ghost Sign in link with returnTo=current path (COA-201).
 * Signed-in: compact ProfileMenu (avatar → Account / Sign out).
 *
 * Sign-out: Chronos `signOutAction` (local cookie clear — never AuthKit
 * `signOut` / WorkOS hosted logout). Then hard-navigate to
 * `window.location.origin/` so a mis-resolved server Location cannot yank
 * the browser to the Vercel/production host.
 */
export function AccountControls() {
  const configured = Boolean(process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI);
  const { user, loading } = useAuth();

  if (!configured) {
    return null;
  }

  if (loading) {
    return <AccountControlsSkeleton />;
  }

  if (!user) {
    return <SignInLink />;
  }

  return (
    <ProfileMenu
      user={user}
      onSignOut={() => {
        void (async () => {
          try {
            await signOutAction();
          } catch {
            // Server Actions throw on redirect(); ignore and force same-origin home.
          }
          window.location.assign(`${window.location.origin}/`);
        })();
      }}
    />
  );
}
