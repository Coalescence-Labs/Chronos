import { NextResponse } from "next/server";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { destroyGitHubOAuthSession } from "@/lib/github-oauth";

/**
 * POST /api/github/disconnect — clear the sealed GitHub OAuth session.
 * GET returns 405 (no CSRF / prefetch disconnect).
 */
export async function POST(): Promise<Response> {
  const { user } = await withAuth({ ensureSignedIn: false }).catch(() => ({
    user: null,
  }));
  // Always destroy the cookie if present — even if WorkOS session already gone.
  await destroyGitHubOAuthSession();
  void user;
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(): Promise<Response> {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } },
  );
}
