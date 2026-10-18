import { afterEach, describe, expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import {
  createInstallationAccessToken,
  deleteInstallation,
  fetchInstallationAccount,
} from "@/lib/github-app/install";
import { createGitHubAppJwt } from "@/lib/github-app/jwt";

function testPrivateKeyPem(): string {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  return privateKey;
}

let restore: (() => void) | null = null;
afterEach(() => {
  restore?.();
  restore = null;
});

function withAppEnv(run: () => Promise<void>): Promise<void> {
  const previous = {
    GITHUB_APP_ID: process.env.GITHUB_APP_ID,
    GITHUB_APP_PRIVATE_KEY: process.env.GITHUB_APP_PRIVATE_KEY,
  };
  process.env.GITHUB_APP_ID = "12345";
  process.env.GITHUB_APP_PRIVATE_KEY = testPrivateKeyPem();
  return run().finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

describe("github app install token exchange", () => {
  test("concurrent reads reuse a repo-scoped token while other repos remain isolated", async () => {
    await withAppEnv(async () => {
      let calls = 0;
      const original = globalThis.fetch;
      globalThis.fetch = (async (_input, init) => {
        calls++;
        const scope = JSON.parse(String(init?.body)).repositories[0];
        return Response.json({ token: `ghs_fake_${scope}`, expires_at: new Date(Date.now() + 3600_000).toISOString() }, { status: 201 });
      }) as typeof fetch;
      restore = () => { globalThis.fetch = original; };
      const tokens = await Promise.all(Array.from({ length: 10 }, () => createInstallationAccessToken(99881, { owner: "acme", repo: "one" })));
      expect(calls).toBe(1); expect(new Set(tokens)).toEqual(new Set(["ghs_fake_one"]));
      expect(await createInstallationAccessToken(99881, { owner: "acme", repo: "two" })).toBe("ghs_fake_two");
      expect(calls).toBe(2);
    });
  });
  test("createInstallationAccessToken POSTs with App JWT Bearer", async () => {
    await withAppEnv(async () => {
      let auth = "";
      let method = "";
      let path = "";
      const original = globalThis.fetch;
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        method = init?.method ?? "GET";
        expect(JSON.parse(String(init?.body))).toEqual({
          permissions: { contents: "read", metadata: "read" }, repositories: ["private"],
        });
        const headers = new Headers(init?.headers);
        auth = headers.get("Authorization") ?? "";
        path = new URL(input instanceof Request ? input.url : input.toString()).pathname;
        return new Response(JSON.stringify({ token: "ghs_test_install_token" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;
      restore = () => {
        globalThis.fetch = original;
      };

      const token = await createInstallationAccessToken(7788, { owner: "acme", repo: "private" });
      expect(token).toBe("ghs_test_install_token");
      expect(method).toBe("POST");
      expect(path).toBe("/app/installations/7788/access_tokens");
      expect(auth.startsWith("Bearer ")).toBe(true);
      const jwt = auth.slice("Bearer ".length);
      const payloadB64 = jwt.split(".")[1] ?? "";
      const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
      expect(payload.iss).toBe("12345");
    });
  });

  test("fetchInstallationAccount reads account login via App JWT", async () => {
    await withAppEnv(async () => {
      const original = globalThis.fetch;
      globalThis.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            id: 42,
            account: { login: "ada", type: "User" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )) as typeof fetch;
      restore = () => {
        globalThis.fetch = original;
      };

      const account = await fetchInstallationAccount(42);
      expect(account).toEqual({
        installationId: 42,
        accountLogin: "ada",
        accountType: "User",
      });
    });
  });

  test("deleteInstallation treats 204 and 404 as success", async () => {
    await withAppEnv(async () => {
      const original = globalThis.fetch;
      let calls = 0;
      globalThis.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
        calls++;
        return new Response(null, { status: calls === 1 ? 204 : 404 });
      }) as typeof fetch;
      restore = () => {
        globalThis.fetch = original;
      };

      expect(await deleteInstallation(1)).toBe(true);
      expect(await deleteInstallation(1)).toBe(true);
    });
  });

  test("createGitHubAppJwt refuses missing credentials", () => {
    expect(() => createGitHubAppJwt("", "")).toThrow(/not configured/);
  });
});
