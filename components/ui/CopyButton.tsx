"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import styles from "./copy-button.module.css";

/**
 * Copies `value` to the clipboard on a single click/tap (the natural,
 * touch-friendly motion — no double-click, which conflicts with text
 * selection on desktop and double-tap-to-zoom on mobile). Shows transient
 * "Copied ✓" feedback, announced via aria-live.
 */

export interface CopyButtonProps {
  value: string;
  /** Accessible label, e.g. "Copy full SHA". */
  label: string;
  /** Visible content (defaults to the value). */
  children?: ReactNode;
  className?: string;
}

export function CopyButton({ value, label, children, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(value);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (insecure context / denied) — fail quietly.
    }
  };

  return (
    <button
      type="button"
      className={[styles.copy, className].filter(Boolean).join(" ")}
      aria-label={label}
      data-copied={copied || undefined}
      onClick={copy}
    >
      <span className={styles.value}>{children ?? value}</span>
      <span className={styles.state} aria-live="polite">
        {copied ? "Copied ✓" : "Copy"}
      </span>
    </button>
  );
}
