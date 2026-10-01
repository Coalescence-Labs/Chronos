"use client";

import Link from "next/link";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { Button } from "@/components/ui/Button";
import buttonStyles from "@/components/ui/button.module.css";
import styles from "./account-controls.module.css";

/**
 * Client shell affordance — useAuth() so statically prerendered pages still
 * reflect the runtime session. Sign-in is hidden unless the public redirect
 * URI is configured (no WORKOS_API_KEY on the client).
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

  const label = user.firstName?.trim() || user.email;

  return (
    <div className={styles.row}>
      <Link className={styles.email} href="/account" prefetch={false} title={user.email}>
        {label}
      </Link>
      <Button
        variant="ghost"
        type="button"
        onClick={() => {
          void signOut({ returnTo: "/" });
        }}
      >
        Sign out
      </Button>
    </div>
  );
}
