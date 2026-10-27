import { NextResponse } from "next/server";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { disconnectGitHubForUser } from "@/lib/github-app/disconnect";
import { isSameOriginMutation, enforceRequestLimitAsync } from "@/lib/security/request";
import { errorResponse } from "@/lib/ingest/respond";

/** POST-only, same-origin disconnect; installation removal stays in GitHub settings. */
export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { user } = await withAuth({ ensureSignedIn: false }).catch(() => ({ user: null }));
  try { await enforceRequestLimitAsync(request, user?.id, "connection"); }
  catch (error) { return errorResponse(error); }
  const result = await disconnectGitHubForUser(user?.id);
  return NextResponse.json(result, { status: result.ok ? 200 : user ? 503 : 401, headers: { "Cache-Control": "no-store" } });
}

export async function GET(): Promise<Response> {
  return NextResponse.json({ error: "Method not allowed" }, {
    status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" },
  });
}
