"use client";

import { useId } from "react";
import { ThemePreferenceControl } from "@/components/shell/ThemePreferenceControl";
import styles from "./profile-menu.module.css";

/**
 * Ergon-style quick-setting row: "Theme" label + compact System / Dark / Light
 * segment. Lives as its own menu section (not nested under identity).
 */
export function ProfileThemeControl() {
  const labelId = useId();

  return (
    <div className={styles.themeSection} role="presentation">
      <div className={styles.themeRow}>
        <span className={styles.themeLabel} id={labelId}>
          Theme
        </span>
        <ThemePreferenceControl variant="profile" labelledBy={labelId} />
      </div>
    </div>
  );
}
