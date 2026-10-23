"use client";

import { ThemePreferenceControl } from "@/components/shell/ThemePreferenceControl";
import styles from "./profile-menu.module.css";

/** Compact System / Dark / Light segment inside the signed-in profile menu. */
export function ProfileThemeControl() {
  return (
    <div className={styles.themeRow}>
      <span className={styles.themeLabel} id="profile-theme-label">
        Theme
      </span>
      <ThemePreferenceControl variant="profile" />
    </div>
  );
}
