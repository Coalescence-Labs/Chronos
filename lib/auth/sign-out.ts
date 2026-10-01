"use server";

import { cookies } from "next/headers";
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
 * Clear the Chronos AuthKit session cookie and redirect in-app.
 *
 * AuthKit's `signOut()` always bounces through
 * `GET /user_management/sessions/logout?session_id=&return_to=` after clearing
 * the cookie. If the dashboard **Logout redirect URI** is missing or does not
 * exactly match `return_to`, WorkOS sends the browser to **error.workos.com**
 * ("Couldn't sign in") even though Chronos is already signed out.
 *
 * For Chronos, the sealed httpOnly cookie *is* the app session — clearing it
 * locally is sufficient. Skipping hosted logout avoids the dashboard allowlist
 * footgun while keeping sign-out reliable.
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

  redirect(sanitizeReturnPath(returnPath));
}
