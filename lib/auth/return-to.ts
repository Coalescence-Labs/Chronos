/**
 * Safe return paths for AuthKit sign-in / sign-out.
 *
 * WorkOS logout requires an absolute returnTo that matches a dashboard
 * Sign-out redirect URI. Relative "/" triggers AuthKit's hosted error UI
 * ("Couldn't sign in") even though the Chronos session cookie was already cleared.
 */

import { SITE_URL } from "@/lib/site";

/** App origin used for absolute AuthKit logout returnTo. */
export function authAppOrigin(): string {
  const redirect = process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI?.trim();
  if (redirect) {
    try {
      return new URL(redirect).origin;
    } catch {
      // fall through
    }
  }
  return SITE_URL;
}

function isAuthLoopPath(pathname: string): boolean {
  return (
    pathname === "/sign-in" ||
    pathname.startsWith("/sign-in/") ||
    pathname === "/sign-up" ||
    pathname.startsWith("/sign-up/") ||
    pathname === "/callback" ||
    pathname.startsWith("/callback/") ||
    pathname.startsWith("/api/auth")
  );
}

/**
 * Same-origin relative path only. Blocks open redirects and auth-route loops.
 * Default: `/`.
 */
export function sanitizeReturnPath(raw: string | null | undefined): string {
  if (!raw) return "/";
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return "/";
  if (trimmed.includes("\\") || trimmed.includes("@")) return "/";

  let pathname = trimmed;
  let search = "";
  const q = trimmed.indexOf("?");
  if (q >= 0) {
    pathname = trimmed.slice(0, q);
    search = trimmed.slice(q);
  }

  if (!pathname || isAuthLoopPath(pathname)) return "/";
  return `${pathname}${search}`;
}

/** Absolute URL for WorkOS logout returnTo (must match dashboard Sign-out URI). */
export function absoluteAuthReturnUrl(path: string = "/"): string {
  const safe = sanitizeReturnPath(path);
  const origin = authAppOrigin();
  return safe === "/" ? `${origin}/` : `${origin}${safe}`;
}

/** Build /sign-in?returnTo=… for the current page. */
export function signInHrefForReturn(returnPath: string): string {
  const safe = sanitizeReturnPath(returnPath);
  if (safe === "/") return "/sign-in";
  return `/sign-in?returnTo=${encodeURIComponent(safe)}`;
}
