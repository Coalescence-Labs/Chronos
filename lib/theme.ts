/**
 * Theme model shared by the boot script (app/layout.tsx), the toggle
 * (components/shell/ThemeToggle.tsx), and browser-chrome surfaces that
 * cannot read CSS variables (PWA manifest, meta theme-color).
 *
 * CHROME_BG / CHROME_BG_LIGHT mirror --bg per theme in app/globals.css —
 * keep them in sync when the palette changes (tests/theme.test.ts checks).
 */
export const CHROME_BG = "#0a0c10";
export const CHROME_BG_LIGHT = "#f7f4ed";

/** localStorage key for the persisted preference. The single source of truth. */
export const THEME_STORAGE_KEY = "chronos-theme";

export type ThemePreference = "system" | "dark" | "light";
export type ResolvedTheme = "dark" | "light";

export const THEME_PREFERENCES: readonly ThemePreference[] = ["system", "dark", "light"];

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "dark" || value === "light";
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersLight: boolean,
): ResolvedTheme {
  if (preference === "system") return systemPrefersLight ? "light" : "dark";
  return preference;
}

/**
 * Runs inline in <head> before first paint so the stored theme applies
 * without a flash. "System" is resolved here (and re-resolved live by
 * ThemeToggle when the OS preference changes) so data-theme is always a
 * concrete value and [data-theme="light"] in app/globals.css stays the only
 * light-mode block. Anything unexpected falls through to the dark default.
 */
export const THEME_INIT_SCRIPT = `(function () {
  try {
    var stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    var preference = stored === "dark" || stored === "light" ? stored : "system";
    var light =
      preference === "light" ||
      (preference === "system" && matchMedia("(prefers-color-scheme: light)").matches);
    document.documentElement.dataset.theme = light ? "light" : "dark";
  } catch (_) {}
})();`;
