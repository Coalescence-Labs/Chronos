import { NextResponse } from "next/server";
import { withAuth } from "@workos-inc/authkit-nextjs";
import {
  clearGitHubInstallMetadata,
  deleteInstallation,
  destroyGitHubAppSession,
  peekGitHubInstallBinding,
} from "@/lib/github-app";
import { githubInstallBindings } from "@/lib/github-app/bindings";

/**
 * POST /api/github/disconnect — clear connections; preserve shared org installs.
 * GET returns 405 (no CSRF / prefetch disconnect).
 */
export async function POST(): Promise<Response> {
  const { user } = await withAuth({ ensureSignedIn: false }).catch(() => ({
    user: null,
  }));
  const binding = await peekGitHubInstallBinding(user?.id);
  if (binding) {
    for (const install of githubInstallBindings(binding)) {
      if (install.accountType === "Organization") continue;
      try {
        await deleteInstallation(install.installationId);
      } catch {
        // Cookie clear still proceeds.
      }
    }
  }
  try {
    if (user?.id) await clearGitHubInstallMetadata(user.id);
  } finally {
    await destroyGitHubAppSession();
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(): Promise<Response> {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } },
  );
}
