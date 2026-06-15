import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./shell.module.css";
import { ThemeToggle } from "./ThemeToggle";

/**
 * Responsive page scaffold: header + content column, safe-area aware so the
 * PWA feels native on phones. The inspection surface (components/ui)
 * overlays this shell as a sheet (phone) or side panel (laptop).
 */

function BrandMark() {
  return (
    <svg
      className={styles.brandMark}
      width="22"
      height="22"
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <path d="M14 32V18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path
        d="M14 24c0-6 12-4 12-12"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="14" cy="34" r="3.5" fill="currentColor" />
      <circle cx="14" cy="16" r="3.5" fill="currentColor" />
      <circle cx="26" cy="10" r="3.5" fill="currentColor" />
    </svg>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#main">
        Skip to content
      </a>
      <header className={styles.header}>
        <Link className={styles.brand} href="/">
          <BrandMark />
          Chronos
        </Link>
        <ThemeToggle />
      </header>
      <main id="main" className={styles.main}>
        {children}
      </main>
    </div>
  );
}
