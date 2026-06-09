"use client";

import type { ReactNode } from "react";
import { Surface } from "./Surface";
import styles from "./inspection.module.css";

/**
 * The inspection surface for progressive depth (docs/DESIGN.md): a bottom
 * sheet on phones, a side panel on laptops — same component, same content.
 * Non-modal: the graph stays interactive behind it.
 */

export interface InspectionSurfaceProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function InspectionSurface({ open, onClose, title, children }: InspectionSurfaceProps) {
  return (
    <Surface
      level={3}
      padded={false}
      role="complementary"
      aria-label={title}
      aria-hidden={!open}
      data-open={open}
      className={styles.surface}
    >
      <div className={styles.handle} aria-hidden="true" />
      <header className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label="Close inspector"
          tabIndex={open ? 0 : -1}
        >
          ✕
        </button>
      </header>
      <div className={styles.body}>{children}</div>
    </Surface>
  );
}
