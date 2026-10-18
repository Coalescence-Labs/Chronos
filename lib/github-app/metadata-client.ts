import { WorkOS } from "@workos-inc/node";

let client: WorkOS | undefined;
let configuredKey: string | undefined;

export function githubMetadataClient(): WorkOS {
  const key = process.env.WORKOS_API_KEY;
  if (!client || configuredKey !== key) {
    configuredKey = key;
    client = new WorkOS(key, { clientId: process.env.WORKOS_CLIENT_ID, timeout: 12_000, maxRetries: 0 });
  }
  return client;
}
