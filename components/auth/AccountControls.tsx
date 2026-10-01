"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { signOutAction } from "@/lib/auth/actions";
import { signInHrefForReturn } from "@/lib/auth/return-to";
import buttonStyles from "@/components/ui/button.module.css";
import { ProfileMenu } from "./ProfileMenu";

/**
 * Client shell affordance — useAuth() so statically prerendered pages still
 * reflect the runtime session. Sign-in is hidden unless the public redirect
 * URI is configured (no WORKOS_API_KEY on the client).
 *
 * Signed-in: compact ProfileMenu (avatar → Account / Sign out).
 * Signed-out: ghost Sign in link with returnTo=current path. No multi-repo chrome (COA-201).
 *
 * Sign-out: Chronos `signOutAction` (local cookie clear — never AuthKit
 * `signOut` / WorkOS hosted logout). Then hard-navigate to
 * `window.location.origin/` so a mis-resolved server Location cannot yank
 * the browser to the Vercel/production host.
 */
export function AccountControls() {
  const configured = Boolean(process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI);
  const { user, loading } = useAuth();
  const pathname = usePathname() || "/";

  if (!configured) {
    return null;
  }

  if (loading) {
    return null;
  }

  if (!user) {
    return (
      <Link
        className={`${buttonStyles.button} ${buttonStyles.ghost}`}
        href={signInHrefForReturn(pathname)}
        prefetch={false}
      >
        Sign in
      </Link>
    );
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
