"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { profileDisplayName, profileInitial } from "@/lib/auth/profile-label";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
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
 * Top-bar profile control: compact avatar opens a menu with theme + Account +
 * Sign out. Mirrors ThemeToggle's outside-click / Escape collapse — no menu library.
 * Theme radios stay a radiogroup (not menuitems) so ARIA roles stay valid.
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
    const firstItem = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    firstItem?.focus();
  }, [open]);

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    if (items.length === 0) return;

    const current = document.activeElement as HTMLElement | null;
    const index = current ? items.indexOf(current) : -1;
    // Theme radiogroup owns its own arrow keys when focused.
    if (index < 0) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      const next = items[(index + delta + items.length) % items.length];
      next?.focus();
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      items[0]?.focus();
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      items[items.length - 1]?.focus();
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
          <div className={styles.themeSection} role="presentation">
            <p className={styles.themeLabel} id={`${reactId}-theme`}>
              Theme
            </p>
            <ThemeToggle layout="menu" />
          </div>
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
