"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";
import styles from "./shell.module.css";
import { ThemeToggle } from "./ThemeToggle";

function AppearanceFooterChrome() {
  return (
    <footer className={styles.shellFooter} aria-label="Appearance">
      <div className={styles.footerTheme}>
        <ThemeToggle />
      </div>
    </footer>
  );
}

/**
 * Guest appearance strip. Signed-in users set theme from the profile menu;
 * hide the footer while AuthKit is resolving so the strip does not flash.
 *
 * When WorkOS is unset, AuthProvider skips AuthKitProvider — never call
 * useAuth() in that mode (e2e / anonymous builds).
 */
export function ShellAppearanceFooter() {
  const configured = Boolean(process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI);
  if (!configured) {
    return <AppearanceFooterChrome />;
  }
  return <ShellAppearanceFooterAuthed />;
}

function ShellAppearanceFooterAuthed() {
  const { user, loading } = useAuth();

  if (loading || user) {
    return null;
  }

  return <AppearanceFooterChrome />;
}
