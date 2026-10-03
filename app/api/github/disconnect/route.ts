import { NextResponse } from "next/server";
import { withAuth } from "@workos-inc/authkit-nextjs";
import {
  clearGitHubInstallMetadata,
  deleteInstallation,
  destroyGitHubAppSession,
  peekGitHubInstallBinding,
} from "@/lib/github-app";

/**
 * POST /api/github/disconnect — clear sealed session + best-effort uninstall.
 * GET returns 405 (no CSRF / prefetch disconnect).
 */
export async function POST(): Promise<Response> {
  const { user } = await withAuth({ ensureSignedIn: false }).catch(() => ({
    user: null,
  }));
  const binding = await peekGitHubInstallBinding(user?.id);
  if (binding) {
    try {
      await deleteInstallation(binding.installationId);
    } catch {
      // Cookie clear still proceeds.
    }
  }
  if (user?.id) {
    await clearGitHubInstallMetadata(user.id);
  }
  await destroyGitHubAppSession();
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(): Promise<Response> {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } },
  );
}
