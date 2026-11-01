import { withAuth } from "@workos-inc/authkit-nextjs";
import { writeAgentOptIn } from "@/lib/agent/metadata";
import { isSameOriginMutation } from "@/lib/security/request";

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginMutation(request)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const { user } = await withAuth({ ensureSignedIn: true });
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save preference";
    return Response.json({ error: message }, { status: 503 });
  }
  return Response.json({ enabled: body.enabled });
}
