"use client";

import Link from "next/link";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import buttonStyles from "@/components/ui/button.module.css";
import { ProfileMenu } from "./ProfileMenu";

/**
 * Client shell affordance — useAuth() so statically prerendered pages still
 * reflect the runtime session. Sign-in is hidden unless the public redirect
 * URI is configured (no WORKOS_API_KEY on the client).
 *
 * Signed-in: compact ProfileMenu (avatar → Account / Sign out).
 * Signed-out: ghost Sign in link. No multi-repo chrome (COA-201).
 *
 * Uses AuthKit's client signOut — do not import lib/auth/actions here (that
 * module pulls server-only and breaks client/bundled test imports).
 */
export function AccountControls() {
  const configured = Boolean(process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI);
  const { user, loading, signOut } = useAuth();

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
        href="/sign-in"
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
        void signOut({ returnTo: "/" });
      }}
    />
  );
}
