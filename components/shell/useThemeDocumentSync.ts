"use client";

import { useEffect } from "react";
import { resolveTheme, syncThemeColor, type ThemePreference } from "@/lib/theme";

/** Keeps `<html data-theme>` and theme-color in sync with the stored preference. */
export function useThemeDocumentSync(preference: ThemePreference) {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => {
      const resolved = resolveTheme(preference, media.matches);
      document.documentElement.dataset.theme = resolved;
      syncThemeColor(resolved);
    };
    apply();
    if (preference !== "system") return;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preference]);
}
