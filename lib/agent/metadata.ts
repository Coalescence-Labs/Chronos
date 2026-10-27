import { isAuthConfigured } from "@/lib/auth/config";
import { githubMetadataClient } from "@/lib/github-app/metadata-client";
import { AGENT_METADATA_OPT_IN_KEY } from "./config";

export async function readAgentOptIn(workosUserId: string): Promise<boolean> {
  if (!isAuthConfigured()) return false;
  const user = await githubMetadataClient().userManagement.getUser(workosUserId);
  return user.metadata?.[AGENT_METADATA_OPT_IN_KEY] === "1";
}

export async function writeAgentOptIn(workosUserId: string, enabled: boolean): Promise<void> {
  if (!isAuthConfigured()) throw new Error("WorkOS is not configured");
  const workos = githubMetadataClient();
  const current = await workos.userManagement.getUser(workosUserId);
  const metadata = current.metadata ?? {};
  if (enabled) {
    if (metadata[AGENT_METADATA_OPT_IN_KEY] === "1") return;
    const keys = Object.keys(metadata).filter((key) => metadata[key] !== null);
    if (!metadata[AGENT_METADATA_OPT_IN_KEY] && keys.length >= 10) {
      throw new Error("WorkOS metadata is full — cannot store Agent preference");
    }
    await workos.userManagement.updateUser({
      userId: workosUserId,
      metadata: { [AGENT_METADATA_OPT_IN_KEY]: "1" },
    });
    return;
  }
  if (!(AGENT_METADATA_OPT_IN_KEY in metadata)) return;
  await workos.userManagement.updateUser({
    userId: workosUserId,
    metadata: { [AGENT_METADATA_OPT_IN_KEY]: null },
  });
}
