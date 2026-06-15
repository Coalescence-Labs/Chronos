"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  isThemePreference,
  resolveTheme,
  THEME_PREFERENCES,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "@/lib/theme";
import styles from "./shell.module.css";

/**
 * Three-state theme control (System / Dark / Light) for the AppShell header.
 * The preference lives in localStorage under THEME_STORAGE_KEY; the boot
 * script in app/layout.tsx applies it pre-paint, this component keeps
 * <html data-theme> in sync afterwards (including live OS changes while on
 * "System"). Server render assumes "system" and corrects itself on mount via
 * useSyncExternalStore, so hydration never mismatches.
 */

const listeners = new Set<() => void>();

function readPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

function writePreference(preference: ThemePreference) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage unavailable (private mode): theme still applies for the session.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function SystemIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="3"
        y="4.5"
        width="18"
        height="12.5"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M9 20.5h6M12 17.5v3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DarkIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20.3 13.6A8.4 8.4 0 0 1 10.4 3.7a8.4 8.4 0 1 0 9.9 9.9Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LightIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.5 1.5M6.8 17.2l-1.5 1.5M18.7 18.7l-1.5-1.5M6.8 6.8 5.3 5.3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

const OPTIONS: Array<{ value: ThemePreference; label: string; icon: React.ReactNode }> = [
  { value: "system", label: "System theme", icon: <SystemIcon /> },
  { value: "dark", label: "Dark theme", icon: <DarkIcon /> },
  { value: "light", label: "Light theme", icon: <LightIcon /> },
];

export function ThemeToggle() {
  const preference = useSyncExternalStore(subscribe, readPreference, () => "system" as const);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => {
      document.documentElement.dataset.theme = resolveTheme(preference, media.matches);
    };
    apply();
    if (preference !== "system") return;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preference]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const delta =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (delta === 0) return;
    event.preventDefault();
    const count = THEME_PREFERENCES.length;
    const next = THEME_PREFERENCES[(THEME_PREFERENCES.indexOf(preference) + delta + count) % count]!;
    writePreference(next);
    const radios = event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    radios[THEME_PREFERENCES.indexOf(next)]?.focus();
  };

  return (
    <div
      className={styles.themeToggle}
      role="radiogroup"
      aria-label="Theme"
      onKeyDown={onKeyDown}
    >
      {OPTIONS.map(({ value, label, icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={preference === value}
          tabIndex={preference === value ? 0 : -1}
          className={styles.themeOption}
          aria-label={label}
          title={label}
          onClick={() => writePreference(value)}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}
