import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { githubFetch } from "@/lib/github-app/http";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

describe("bounded GitHub transport", () => {
  test("rejects an oversized response before reading its body", async () => {
    globalThis.fetch = (async () => new Response("small", { headers: { "content-length": String(6 * 1024 * 1024) } })) as unknown as typeof fetch;
    await expect(githubFetch("https://api.github.com/repos/acme/widgets")).rejects.toMatchObject({ code: "too-large" });
  });
  test("also bounds streamed responses without Content-Length", async () => {
    globalThis.fetch = (async () => new Response(new Uint8Array(5 * 1024 * 1024 + 1))) as unknown as typeof fetch;
    await expect(githubFetch("https://api.github.com/repos/acme/widgets")).rejects.toMatchObject({ code: "too-large" });
  });
  test("never follows authenticated redirects to another origin", async () => {
    let calls = 0;
    globalThis.fetch = (async () => { calls++; return new Response(null, { status: 302, headers: { location: "https://untrusted.test/steal" } }); }) as unknown as typeof fetch;
    await expect(githubFetch("https://api.github.com/repos/acme/widgets", { headers: { Authorization: "Bearer fake" } })).rejects.toMatchObject({ code: "upstream" });
    expect(calls).toBe(1);
  });
  test("supports repository redirects within GitHub without accepting arbitrary endpoints", async () => {
    const paths: string[] = [];
    globalThis.fetch = (async (input) => {
      paths.push(new URL(String(input)).pathname);
      return paths.length === 1 ? new Response(null, { status: 301, headers: { location: "/repositories/42" } }) : Response.json({ private: false });
    }) as typeof fetch;
    expect((await githubFetch("https://api.github.com/repos/acme/renamed")).status).toBe(200);
    expect(paths).toEqual(["/repos/acme/renamed", "/repositories/42"]);
    await expect(githubFetch("https://untrusted.test/")).rejects.toMatchObject({ code: "upstream" });
  });
  test("upstream timeouts return a recoverable error", async () => {
    const controller = new AbortController();
    const timeout = spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    globalThis.fetch = ((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    })) as typeof fetch;
    try {
      const pending = githubFetch("https://api.github.com/repos/acme/widgets");
      controller.abort();
      await expect(pending).rejects.toMatchObject({ code: "upstream", message: expect.stringContaining("too long") });
    } finally { timeout.mockRestore(); }
  });
  test("concurrency exhaustion rejects new work instead of building an unbounded queue", async () => {
    const release: (() => void)[] = [];
    globalThis.fetch = (() => new Promise<Response>((resolve) => { release.push(() => resolve(Response.json({}))); })) as unknown as typeof fetch;
    const pending = Array.from({ length: 32 }, () => githubFetch("https://api.github.com/repos/acme/widgets"));
    try {
      await expect(githubFetch("https://api.github.com/repos/acme/widgets")).rejects.toMatchObject({ code: "rate-limited", retryAfterSeconds: 1 });
    } finally { release.forEach((resolve) => resolve()); await Promise.all(pending); }
  });
});
