"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  isThemePreference,
  resolveTheme,
  syncThemeColor,
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
 *
 * On phones the control collapses to just the active theme's icon to save
 * header space; tapping it expands the three options, and an outside tap or
 * Escape collapses it again. On wider screens it's always expanded (CSS).
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
  const [expanded, setExpanded] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => {
      const resolved = resolveTheme(preference, media.matches);
      document.documentElement.dataset.theme = resolved;
      syncThemeColor(resolved); // keep the mobile status bar matched to the surface
    };
    apply();
    if (preference !== "system") return;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preference]);

  // Collapse the expanded (mobile) control on an outside tap or Escape.
  useEffect(() => {
    if (!expanded) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setExpanded(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [expanded]);

  const active = OPTIONS.find((option) => option.value === preference) ?? OPTIONS[0]!;

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
    <div className={styles.themeToggle} data-expanded={expanded || undefined} ref={rootRef}>
      {/* Collapsed trigger (phones only, via CSS): shows the active theme's
          icon and expands the options. Outside the radiogroup for valid ARIA. */}
      <button
        type="button"
        className={styles.themeTrigger}
        aria-expanded={expanded}
        aria-label={`Theme: ${active.label}. Change theme`}
        title="Change theme"
        onClick={() => setExpanded((open) => !open)}
      >
        {active.icon}
      </button>
      <div className={styles.themeOptions} role="radiogroup" aria-label="Theme" onKeyDown={onKeyDown}>
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
    </div>
  );
}
