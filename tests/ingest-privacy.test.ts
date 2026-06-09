import { afterEach, describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { GET as getRepo } from "@/app/api/repo/route";
import { mockGitHub, smallRepoHandler } from "./fixtures/github";

/**
 * docs/PRIVACY.md, binding: repo data transits the BFF transiently — no
 * server-side persistence, no logging of repo content. Verified two ways:
 * at runtime (a full ingestion emits zero console output) and statically
 * (the ingestion paths contain no console or fs usage at all).
 */

const CONSOLE_METHODS = ["log", "info", "warn", "error", "debug", "trace"] as const;

let restore: (() => void) | null = null;
afterEach(() => {
  restore?.();
  restore = null;
});

describe("ingestion privacy posture", () => {
  test("a full ingestion request logs nothing", async () => {
    restore = mockGitHub(smallRepoHandler);
    const emitted: string[] = [];
    const originals = CONSOLE_METHODS.map((method) => {
      const original = console[method];
      console[method] = (...args: unknown[]) => {
        emitted.push(`console.${method}: ${args.join(" ")}`);
      };
      return [method, original] as const;
    });

    try {
      const response = await getRepo(
        new Request("http://localhost/api/repo?repo=acme/widgets"),
      );
      expect(response.status).toBe(200);
      await response.json();
    } finally {
      for (const [method, original] of originals) {
        console[method] = original;
      }
    }
    expect(emitted).toEqual([]);
  });

  test("ingestion code contains no logging or filesystem writes", async () => {
    const glob = new Glob("**/*.{ts,tsx}");
    const paths = [
      ...(await Array.fromAsync(glob.scan("lib/ingest"))).map((p) => `lib/ingest/${p}`),
      ...(await Array.fromAsync(glob.scan("app/api"))).map((p) => `app/api/${p}`),
    ];
    const violations: string[] = [];
    let filesChecked = 0;

    for (const path of paths) {
      filesChecked++;
      const source = await Bun.file(path).text();
      if (/console\.|node:fs|Bun\.write|writeFileSync|localStorage/.test(source)) {
        violations.push(path);
      }
    }

    expect(filesChecked).toBeGreaterThan(0);
    expect(violations).toEqual([]);
  });

  test("error responses never echo raw repo input", async () => {
    restore = mockGitHub(smallRepoHandler);
    const hostile = "https://gitlab.com/acme/widgets<script>";
    const response = await getRepo(
      new Request(`http://localhost/api/repo?repo=${encodeURIComponent(hostile)}`),
    );
    expect(response.status).toBe(400);
    const text = await response.text();
    expect(text).not.toContain("gitlab.com");
    expect(text).not.toContain("<script>");
  });
});
