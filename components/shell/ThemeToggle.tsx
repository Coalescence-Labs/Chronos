"use client";

import { ThemePreferenceControl } from "./ThemePreferenceControl";

/**
 * Three-state theme control (System / Dark / Light) for the AppShell footer.
 * Preference lives in localStorage; boot script in app/layout.tsx applies it
 * pre-paint. On phones the footer control collapses to the active icon.
 */
export function ThemeToggle() {
  return <ThemePreferenceControl variant="footer" />;
}
