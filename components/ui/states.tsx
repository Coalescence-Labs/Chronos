import type { ReactNode } from "react";
import { Button } from "./Button";
import styles from "./states.module.css";

/**
 * Designed loading / empty / error states (docs/DESIGN.md polish bar) —
 * reusable everywhere instead of default spinners and raw error text.
 * Each pairs its meaning with text, not color alone.
 */

function GraphGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <path d="M14 32V18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M14 24c0-6 12-4 12-12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="14" cy="34" r="3" fill="currentColor" />
      <circle cx="14" cy="16" r="3" fill="currentColor" />
      <circle cx="26" cy="10" r="3" fill="currentColor" />
    </svg>
  );
}

export function LoadingState({ label = "Reading history…", fill }: { label?: string; fill?: boolean }) {
  return (
    <div className={`${styles.state}${fill ? ` ${styles.fill}` : ""}`} role="status">
      <div className={styles.orbits} aria-hidden="true">
        <span className={styles.orbit} />
        <span className={styles.orbit} />
        <span className={styles.orbit} />
      </div>
      <span className={styles.loadingLabel}>{label}</span>
    </div>
  );
}

export interface EmptyStateProps {
  title: string;
  hint?: string;
  action?: ReactNode;
  /** Grow to fill (and center within) a flex parent — for full-screen use. */
  fill?: boolean;
}

export function EmptyState({ title, hint, action, fill }: EmptyStateProps) {
  return (
    <div className={`${styles.state}${fill ? ` ${styles.fill}` : ""}`}>
      <GraphGlyph className={styles.glyph} />
      <h2 className={styles.title}>{title}</h2>
      {hint && <p className={styles.detail}>{hint}</p>}
      {action}
    </div>
  );
}

export interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  /** Grow to fill (and center within) a flex parent — for full-screen use. */
  fill?: boolean;
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  retryLabel = "Try again",
  fill,
}: ErrorStateProps) {
  return (
    <div className={`${styles.state}${fill ? ` ${styles.fill}` : ""}`} role="alert">
      <GraphGlyph className={styles.errorGlyph} />
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.detail}>{message}</p>
      {onRetry && (
        <Button variant="ghost" className={styles.retry} onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
