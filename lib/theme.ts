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

/** The browser-chrome (status bar / theme-color) value for a resolved theme. */
export function chromeColor(theme: ResolvedTheme): string {
  return theme === "light" ? CHROME_BG_LIGHT : CHROME_BG;
}

/**
 * Point the <meta name="theme-color"> at the active background so the mobile
 * status-bar area matches the app surface (immersive, seamless). Creates the
 * meta if missing. No-op on the server.
 */
export function syncThemeColor(theme: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", chromeColor(theme));
}

/**
 * Runs inline in <head> before first paint so the stored theme applies
 * without a flash. "System" is resolved here (and re-resolved live by
 * ThemeToggle when the OS preference changes) so data-theme is always a
 * concrete value and [data-theme="light"] in app/globals.css stays the only
 * light-mode block. It also points theme-color at the active background so
 * the mobile status bar matches from the first paint. Anything unexpected
 * falls through to the dark default.
 */
export const THEME_INIT_SCRIPT = `(function () {
  try {
    var stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    var preference = stored === "dark" || stored === "light" ? stored : "system";
    var light =
      preference === "light" ||
      (preference === "system" && matchMedia("(prefers-color-scheme: light)").matches);
    document.documentElement.dataset.theme = light ? "light" : "dark";
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", light ? ${JSON.stringify(CHROME_BG_LIGHT)} : ${JSON.stringify(CHROME_BG)});
  } catch (_) {}
})();`;
