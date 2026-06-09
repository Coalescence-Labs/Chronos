import type { HTMLAttributes } from "react";
import styles from "./surface.module.css";

/**
 * Dimensional glass surface — the base layer for panels, cards, and sheets.
 * Level maps to elevation: 1 resting, 2 raised, 3 floating (docs/DESIGN.md).
 */

export interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  level?: 1 | 2 | 3;
  padded?: boolean;
}

export function Surface({ level = 1, padded = true, className, ...rest }: SurfaceProps) {
  const classes = [
    styles.surface,
    level === 2 && styles.level2,
    level === 3 && styles.level3,
    padded && styles.padded,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return <div className={classes} {...rest} />;
}
