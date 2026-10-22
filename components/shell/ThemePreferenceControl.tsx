"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import {
  readThemePreference,
  subscribeThemePreference,
  writeThemePreference,
} from "@/lib/theme-preference-client";
import { THEME_PREFERENCES, type ThemePreference } from "@/lib/theme";
import { DarkThemeIcon, LightThemeIcon, SystemThemeIcon } from "./theme-icons";
import themeStyles from "./theme-control.module.css";
import { useThemeDocumentSync } from "./useThemeDocumentSync";

const OPTIONS: Array<{ value: ThemePreference; label: string; icon: React.ReactNode }> = [
  { value: "system", label: "System theme", icon: <SystemThemeIcon /> },
  { value: "dark", label: "Dark theme", icon: <DarkThemeIcon /> },
  { value: "light", label: "Light theme", icon: <LightThemeIcon /> },
];

type ThemePreferenceControlProps = {
  /** Footer uses the collapsible mobile trigger; profile stays always expanded. */
  variant?: "footer" | "profile";
  className?: string;
};

export function ThemePreferenceControl({ variant = "footer", className }: ThemePreferenceControlProps) {
  const preference = useSyncExternalStore(
    subscribeThemePreference,
    readThemePreference,
    () => "system" as const,
  );
  const [expanded, setExpanded] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const compact = variant === "profile";

  useThemeDocumentSync(preference);

  useEffect(() => {
    if (!expanded || compact) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setExpanded(false);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [expanded, compact]);

  const active = OPTIONS.find((option) => option.value === preference) ?? OPTIONS[0]!;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const delta =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (delta === 0) return;
    event.preventDefault();
    event.stopPropagation();
    const count = THEME_PREFERENCES.length;
    const next = THEME_PREFERENCES[(THEME_PREFERENCES.indexOf(preference) + delta + count) % count]!;
    writeThemePreference(next);
    const radios = event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    radios[THEME_PREFERENCES.indexOf(next)]?.focus();
  };

  const rootClass = [
    themeStyles.toggle,
    compact ? themeStyles.compact : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={rootClass}
      data-expanded={!compact && expanded ? true : undefined}
      ref={rootRef}
    >
      {!compact ? (
        <button
          type="button"
          className={themeStyles.trigger}
          aria-expanded={expanded}
          aria-label={`Theme: ${active.label}. Change theme`}
          title="Change theme"
          onClick={() => setExpanded((open) => !open)}
        >
          {active.icon}
        </button>
      ) : null}
      <div
        className={themeStyles.options}
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
            className={themeStyles.option}
            aria-label={label}
            title={label}
            onClick={() => writeThemePreference(value)}
          >
            {icon}
          </button>
        ))}
      </div>
    </div>
  );
}
