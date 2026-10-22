import { createAuthProxyHandler } from "@/lib/auth/proxy-handler";
import { NextRequest, NextResponse, type NextFetchEvent } from "next/server";
import { contentSecurityPolicy } from "@/lib/security/headers";

/**
 * Next.js 16 proxy: refreshes the sealed WorkOS session cookie when auth is
 * configured; otherwise a pure pass-through so anonymous public paste/demo
 * work with zero WorkOS env.
 *
 * Matcher excludes Next static assets so CSS/fonts/PWA bits are not intercepted.
 */
const authProxy = createAuthProxyHandler();

export default async function proxy(request: NextRequest, event: NextFetchEvent) {
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64");
  const policy = contentSecurityPolicy(nonce, process.env.NODE_ENV !== "production");
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);
  const response = await authProxy(new NextRequest(request, { headers }), event)
    ?? NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
