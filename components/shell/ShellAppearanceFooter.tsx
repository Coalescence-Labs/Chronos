"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";
import styles from "./shell.module.css";
import { ThemeToggle } from "./ThemeToggle";

/**
 * Guest appearance strip. Signed-in users set theme from the profile menu;
 * hide the footer while AuthKit is resolving so the strip does not flash.
 */
export function ShellAppearanceFooter() {
  const configured = Boolean(process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI);
  const { user, loading } = useAuth();

  if (configured && (loading || user)) {
    return null;
  }

  return (
    <footer className={styles.shellFooter} aria-label="Appearance">
      <div className={styles.footerTheme}>
        <ThemeToggle />
      </div>
    </footer>
  );
}
