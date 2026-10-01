"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { workosRedirectUri } from "./config";
import { sanitizeReturnPath } from "./return-to";

const PKCE_COOKIE_PREFIX = "wos-auth-verifier";

function sessionCookieName(): string {
  return process.env.WORKOS_COOKIE_NAME?.trim() || "wos-session";
}

/**
 * Match AuthKit cookie attributes so delete() actually clears the sealed session.
 * @see @workos-inc/authkit-nextjs getCookieOptions
 */
function sessionCookieDeleteOptions(): {
  path: string;
  sameSite: "lax" | "strict" | "none";
  secure: boolean;
  domain?: string;
} {
  const sameSiteRaw = (process.env.WORKOS_COOKIE_SAMESITE || "lax").toLowerCase();
  const sameSite =
    sameSiteRaw === "strict" || sameSiteRaw === "none" || sameSiteRaw === "lax"
      ? sameSiteRaw
      : "lax";

  let secure = sameSite === "none";
  const redirectUri = workosRedirectUri();
  if (redirectUri) {
    try {
      secure = new URL(redirectUri).protocol === "https:";
    } catch {
      secure = true;
    }
  } else if (sameSite !== "none") {
    secure = process.env.NODE_ENV === "production";
  }

  const domain = process.env.WORKOS_COOKIE_DOMAIN?.trim();
  return {
    path: "/",
    sameSite,
    secure,
    ...(domain ? { domain } : {}),
  };
}

/**
 * Pure: derive request origin from Host / X-Forwarded-* (never SITE_URL).
 * Exported for unit tests — production logout must stay on the browser's host.
 */
export function originFromRequestHost(
  hostHeader: string | null | undefined,
  forwardedProto: string | null | undefined = null,
): string | null {
  const host = (hostHeader || "").split(",")[0]?.trim();
  if (!host) return null;

  const proto =
    forwardedProto?.split(",")[0]?.trim() ||
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");

  return `${proto}://${host}`;
}

/** Absolute same-origin return URL from an explicit request host (testable). */
export function sameOriginReturnUrlForHost(
  hostHeader: string | null | undefined,
  returnPath: string = "/",
  forwardedProto: string | null | undefined = null,
): string {
  const path = sanitizeReturnPath(returnPath);
  const origin = originFromRequestHost(hostHeader, forwardedProto);
  if (!origin) {
    return path === "/" ? "/" : path;
  }
  return path === "/" ? `${origin}/` : `${origin}${path}`;
}

/**
 * Origin of the *current request* (Host / X-Forwarded-*).
 * Never use SITE_URL or env redirect origin here — that can send local logout to Vercel.
 */
export async function requestAuthOrigin(): Promise<string | null> {
  const h = await headers();
  return originFromRequestHost(
    h.get("x-forwarded-host") || h.get("host"),
    h.get("x-forwarded-proto"),
  );
}

/** Build an absolute same-origin URL for post-logout landing. */
export async function sameOriginReturnUrl(returnPath: string = "/"): Promise<string> {
  const h = await headers();
  return sameOriginReturnUrlForHost(
    h.get("x-forwarded-host") || h.get("host"),
    returnPath,
    h.get("x-forwarded-proto"),
  );
}

/**
 * Clear the Chronos AuthKit session cookie and redirect to the **same origin**
 * the user is on (localhost stays on localhost).
 *
 * AuthKit's `signOut()` bounces through WorkOS hosted logout; when `returnTo` is
 * omitted, WorkOS uses the dashboard default Sign-out URI (often production).
 * Chronos skips that path entirely.
 */
export async function chronosSignOut(returnPath: string = "/"): Promise<void> {
  const jar = await cookies();
  const name = sessionCookieName();
  const attrs = sessionCookieDeleteOptions();

  try {
    jar.delete({
      name,
      path: attrs.path,
      sameSite: attrs.sameSite,
      secure: attrs.secure,
      ...(attrs.domain ? { domain: attrs.domain } : {}),
    });
  } catch {
    jar.delete(name);
  }

  for (const cookie of jar.getAll()) {
    if (!cookie.name.startsWith(PKCE_COOKIE_PREFIX)) continue;
    try {
      jar.delete({
        name: cookie.name,
        path: attrs.path,
        sameSite: "lax",
        secure: attrs.secure,
        ...(attrs.domain ? { domain: attrs.domain } : {}),
      });
    } catch {
      jar.delete(cookie.name);
    }
  }

  redirect(await sameOriginReturnUrl(returnPath));
}
