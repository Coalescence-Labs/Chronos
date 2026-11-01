import { withAuth } from "@workos-inc/authkit-nextjs";
import { writeAgentOptIn } from "@/lib/agent/metadata";
import { IngestError, INGEST_ERROR_STATUS } from "@/lib/ingest/errors";
import { enforceRequestLimitAsync, isSameOriginMutation } from "@/lib/security/request";

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginMutation(request)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const { user } = await withAuth({ ensureSignedIn: true });
  try {
    await enforceRequestLimitAsync(request, user.id, "agent");
  } catch (error) {
    if (!(error instanceof IngestError)) throw error;
    return Response.json({ error: error.message }, {
      status: INGEST_ERROR_STATUS[error.code],
      headers: error.retryAfterSeconds ? { "Retry-After": String(error.retryAfterSeconds) } : undefined,
    });
  }
  let body: { enabled?: boolean };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.enabled !== "boolean") {
    return Response.json({ error: "enabled must be a boolean" }, { status: 400 });
  }
  try {
    await writeAgentOptIn(user.id, body.enabled);
  } catch {
    // WorkOS error text is not for the browser.
    return Response.json({ error: "Could not save preference" }, { status: 503 });
  }
  return Response.json({ enabled: body.enabled });
}
