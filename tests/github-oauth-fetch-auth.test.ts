import { afterEach, describe, expect, test } from "bun:test";
import { fetchRepoMeta } from "@/lib/ingest/github/fetch";
import { githubJson, mockGitHub } from "./fixtures/github";

/**
 * When a token is supplied, BFF upstream calls must send Authorization.
 * Anonymous calls must not.
 */

let restore: (() => void) | null = null;
afterEach(() => {
  restore?.();
  restore = null;
});

const id = { owner: "acme", repo: "widgets" };

describe("fetchRepoMeta auth header", () => {
  test("sends Bearer token when accessToken is provided", async () => {
    let auth: string | null = null;
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      auth = headers.get("Authorization");
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.pathname === "/repos/acme/widgets") {
        return githubJson({ default_branch: "main", private: true });
      }
      return githubJson({ message: "Not Found" }, { status: 404 });
    }) as typeof fetch;
    restore = () => {
      globalThis.fetch = original;
    };

    const meta = await fetchRepoMeta(id, { accessToken: "gho_test_token" });
    expect(meta.defaultBranch).toBe("main");
    expect(meta.private).toBe(true);
    expect(auth).toBe("Bearer gho_test_token");
  });

  test("omits Authorization when no token (anonymous / public)", async () => {
    let sawAuth = false;
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      if (headers.has("Authorization")) sawAuth = true;
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.pathname === "/repos/acme/widgets") {
        return githubJson({ default_branch: "main" });
      }
      return githubJson({ message: "Not Found" }, { status: 404 });
    }) as typeof fetch;
    restore = () => {
      globalThis.fetch = original;
    };

    await fetchRepoMeta(id);
    expect(sawAuth).toBe(false);
  });
});

describe("token resolution priority (unit)", () => {
  test("githubAppPoolToken is used when no user session", async () => {
    // Pure config check — session read needs Next cookies() and is covered statically.
    const previous = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = "gho_app_pool";
    try {
      const { githubAppPoolToken } = await import("@/lib/github-oauth/config");
      expect(githubAppPoolToken()).toBe("gho_app_pool");
    } finally {
      if (previous === undefined) delete process.env.GITHUB_TOKEN;
      else process.env.GITHUB_TOKEN = previous;
    }
  });
});

// Keep fixture mock import used so the file stays consistent with other ingest tests.
void mockGitHub;
