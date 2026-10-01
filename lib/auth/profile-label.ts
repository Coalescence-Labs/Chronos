/**
 * Compact identity labels for the shell profile menu.
 * Pure helpers — never log the inputs.
 */

export type ProfileIdentity = {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
};

/** Single letter for the avatar glyph (first name, else email local-part). */
export function profileInitial(user: ProfileIdentity): string {
  const first = user.firstName?.trim();
  if (first) return first.charAt(0).toUpperCase();
  const local = user.email.trim().split("@")[0] ?? "";
  const letter = local.charAt(0);
  return letter ? letter.toUpperCase() : "?";
}

/** Prefer "First Last", else email. */
export function profileDisplayName(user: ProfileIdentity): string {
  const name = [user.firstName?.trim(), user.lastName?.trim()].filter(Boolean).join(" ");
  return name || user.email.trim();
}
