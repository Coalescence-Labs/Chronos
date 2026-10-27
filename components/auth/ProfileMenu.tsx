"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { profileDisplayName, profileInitial } from "@/lib/auth/profile-label";
import { ProfileThemeControl } from "./ProfileThemeControl";
import styles from "./profile-menu.module.css";

export type ProfileMenuUser = {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  profilePictureUrl?: string | null;
};

type ProfileMenuProps = {
  user: ProfileMenuUser;
  onSignOut: () => void;
};

/**
 * Top-bar profile control: compact avatar opens a menu with theme, Account,
 * and Sign out. Outside-click / Escape collapse — no menu library.
 * Theme mirrors Ergon's quick-settings row (label + segmented control).
 */
export function ProfileMenu({ user, onSignOut }: ProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const reactId = useId();
  const menuId = `${reactId}-menu`;
  const triggerId = `${reactId}-trigger`;

  const displayName = profileDisplayName(user);
  const initial = profileInitial(user);
  const showEmailUnderName = Boolean(user.firstName?.trim() || user.lastName?.trim());

  useEffect(() => {
    if (!open) return;

    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Land on the theme radiogroup first (Ergon focuses the settings panel at
    // the theme row); Left/Right cycle preferences, Down reaches Account.
    const checked =
      menuRef.current?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]') ??
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    checked?.focus();
  }, [open]);

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const menu = menuRef.current;
    if (!menu) return;

    const radios = Array.from(menu.querySelectorAll<HTMLElement>('[role="radio"]'));
    const menuitems = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    const current = document.activeElement as HTMLElement | null;
    const onRadio = current ? radios.includes(current) : false;
    const itemIndex = current ? menuitems.indexOf(current) : -1;

    // Vertical nav: theme group ↔ Account / Sign out. Horizontal stays on the
    // radiogroup (ThemePreferenceControl stopPropagates Left/Right).
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;

      if (onRadio) {
        if (delta === 1) menuitems[0]?.focus();
        else menuitems[menuitems.length - 1]?.focus();
        return;
      }

      if (itemIndex < 0) return;

      if (delta === -1 && itemIndex === 0) {
        const checked =
          radios.find((radio) => radio.getAttribute("aria-checked") === "true") ?? radios[0];
        checked?.focus();
        return;
      }
      if (delta === 1 && itemIndex === menuitems.length - 1) {
        const checked =
          radios.find((radio) => radio.getAttribute("aria-checked") === "true") ?? radios[0];
        checked?.focus();
        return;
      }

      menuitems[itemIndex + delta]?.focus();
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      const checked =
        radios.find((radio) => radio.getAttribute("aria-checked") === "true") ?? menuitems[0];
      checked?.focus();
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      menuitems[menuitems.length - 1]?.focus();
      return;
    }

    if (event.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        id={triggerId}
        className={styles.trigger}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        aria-label={`Account menu for ${displayName}`}
        title={displayName}
        onClick={() => setOpen((value) => !value)}
      >
        {user.profilePictureUrl ? (
          <img
            className={styles.avatarImage}
            src={user.profilePictureUrl}
            alt=""
            width={28}
            height={28}
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className={styles.avatarInitial} aria-hidden="true">
            {initial}
          </span>
        )}
      </button>

      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-labelledby={triggerId}
          className={styles.menu}
          onKeyDown={onMenuKeyDown}
        >
          <div className={styles.identity} role="presentation">
            <p className={styles.name}>{displayName}</p>
            {showEmailUnderName ? <p className={styles.email}>{user.email}</p> : null}
          </div>
          <ProfileThemeControl />
          <Link
            role="menuitem"
            className={styles.item}
            href="/account"
            prefetch={false}
            onClick={() => setOpen(false)}
          >
            Account
          </Link>
          <button
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
