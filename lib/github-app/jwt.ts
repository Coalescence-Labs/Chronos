import { createPrivateKey, sign } from "node:crypto";
import { githubAppId, githubAppPrivateKey } from "./config";

function base64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

/**
 * Sign a GitHub App JWT (RS256) for App-authenticated API calls.
 * iat is skewed −60s to tolerate clock drift; exp ≤ 10 minutes (GitHub max).
 */
export function createGitHubAppJwt(
  appId: string = githubAppId() ?? "",
  privateKeyPem: string = githubAppPrivateKey() ?? "",
): string {
  if (!appId || !privateKeyPem) {
    throw new Error("GitHub App credentials are not configured");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64urlJson({ alg: "RS256", typ: "JWT" });
  const payload = base64urlJson({
    iat: now - 60,
    exp: now + 9 * 60,
    iss: appId,
  });
  const unsigned = `${header}.${payload}`;
  const key = createPrivateKey(privateKeyPem);
  const signature = sign("RSA-SHA256", Buffer.from(unsigned, "utf8"), key);
  return `${unsigned}.${signature.toString("base64url")}`;
}
