/**
 * Same-origin return URL helpers for post-logout redirects.
 * Never use SITE_URL — it defaults to production and yanks localhost to Vercel.
 *
 * Pure helpers live here (no `"use server"`) so they can be sync + unit-tested.
 */

import { headers } from "next/headers";
import { sanitizeReturnPath } from "./return-to";

/**
 * Pure: derive request origin from Host / X-Forwarded-* (never SITE_URL).
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
