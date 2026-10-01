"use client";

import Link from "next/link";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import buttonStyles from "@/components/ui/button.module.css";
import { ProfileMenu } from "./ProfileMenu";
import styles from "./account-controls.module.css";

/**
 * Client shell affordance — useAuth() so statically prerendered pages still
 * reflect the runtime session. Sign-in is hidden unless the public redirect
 * URI is configured (no WORKOS_API_KEY on the client).
 *
 * Signed-in: ProfileMenu (avatar → theme + Account / Sign out); no header ThemeToggle.
 * Signed-out: Sign in + header ThemeToggle. No multi-repo chrome (COA-201).
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
    return <ThemeToggle />;
  }

  if (!user) {
    return (
      <div className={styles.row}>
        <Link
          className={`${buttonStyles.button} ${buttonStyles.ghost}`}
          href="/sign-in"
          prefetch={false}
        >
          Sign in
        </Link>
        <ThemeToggle />
      </div>
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
