"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
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
 * Uses AuthKit's client signOut — do not import lib/auth/actions here (that
 * module pulls server-only and breaks client/bundled test imports).
 * Logout returnTo must be absolute (WorkOS Sign-out URI); relative "/" shows
 * AuthKit's "Couldn't sign in" error after the cookie is already cleared.
 */
export function AccountControls() {
  const configured = Boolean(process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI);
  const { user, loading, signOut } = useAuth();
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
        // Absolute origin required for WorkOS logout redirect allowlist.
        void signOut({ returnTo: `${window.location.origin}/` });
      }}
    />
  );
}
